import { chatJson } from "./llm";

export type Severity = "low" | "medium" | "high" | "critical";

export interface Flag {
  clauseType: string;
  quote: string;
  explanation: string;
  severity: Severity;
  whyItMatters: string;
  suggestedChange: string;
}

export interface Analysis {
  docType: string;
  language: string;
  risk: number; // 0-100
  verdict: "standard" | "review" | "negotiate" | "high_risk";
  verdictLabel: string;
  counts: Record<Severity, number>;
  summary: string[];
  questionsToAsk: string[];
  flags: Flag[];
  chunksAnalyzed: number;
  truncated: boolean;
}

const MAX_CHUNKS = 12;
const CHUNK_SIZE = 3000;

const SEVERITIES = ["low", "medium", "high", "critical"];

const FLAG_SYSTEM = `You are a careful contract reviewer protecting an ordinary person who is about to sign.
You are given ONE excerpt of a longer document. Find clauses that could cause the signer financial loss, loss of rights, or hidden obligations.

Look for:
- hidden or large fees, penalties, late charges, forfeited deposits
- auto-renewal, lock-in periods, hard-to-cancel terms
- one-sided termination or one-sided right to change terms/prices without consent
- limits on the other party's liability, or broad indemnity the signer must give
- giving up the right to sue (forced arbitration, faraway jurisdiction)
- ownership of the signer's work, content, or data; sharing of personal data
- vague terms ("at sole discretion", "as determined by us") that favour the other side
- long notice periods, payment delays, exclusions that remove promised coverage

Severity:
- critical: could cause major financial loss or loss of legal rights
- high: significantly one-sided or costly
- medium: unfavourable but common, worth negotiating
- low: minor, worth knowing

Rules:
- "quote" MUST be copied EXACTLY, word for word, from the excerpt (max 300 characters). Never paraphrase the quote.
- Only flag real risks. Standard, balanced clauses must NOT be flagged. If nothing is risky, return {"flags": []}.
- "explanation" is 1-2 sentences in very simple words.
- "whyItMatters" is one concrete example of how the signer could lose out.
- "suggestedChange" is one short sentence the signer could ask for instead.

Return ONLY JSON in this exact shape:
{"flags":[{"clauseType":"short_snake_case_label","quote":"...","explanation":"...","severity":"low|medium|high|critical","whyItMatters":"...","suggestedChange":"..."}]}`;

const SUMMARY_SYSTEM = (language: string) => `You explain legal documents to ordinary people in very simple ${language}.
You get the start of a document and a list of risky clauses already found.
Return ONLY JSON in this exact shape:
{"docType":"e.g. rental agreement, loan agreement, employment contract, terms of service, insurance policy, other",
 "summary":["5 to 7 short bullets saying what this document really commits the signer to"],
 "questionsToAsk":["3 to 5 specific questions the signer should ask before signing"]}
Write the bullets and questions in ${language}. Do not invent facts that are not in the text.`;

// ---------- helpers ----------

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

function chunkText(text: string): string[] {
  const paras = text.split(/\n{1,}/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let cur = "";
  for (const p of paras) {
    if ((cur + "\n" + p).length > CHUNK_SIZE && cur) {
      chunks.push(cur);
      cur = p;
    } else {
      cur = cur ? cur + "\n" + p : p;
    }
    while (cur.length > CHUNK_SIZE * 1.5) {
      chunks.push(cur.slice(0, CHUNK_SIZE));
      cur = cur.slice(CHUNK_SIZE);
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

/** Hallucination guard: the quote must really exist in the document. */
function quoteExists(quote: string, normalizedSource: string): boolean {
  const q = norm(quote);
  if (q.length < 15) return false;
  if (normalizedSource.includes(q)) return true;
  // tolerate small model edits at the end of long quotes
  return q.length > 80 && normalizedSource.includes(q.slice(0, 60));
}

const WEIGHT: Record<Severity, number> = { low: 1, medium: 3, high: 6, critical: 10 };

/** Deterministic scoring: the LLM labels, our code decides the rating. */
function score(flags: Flag[]) {
  const counts: Record<Severity, number> = { low: 0, medium: 0, high: 0, critical: 0 };
  let raw = 0;
  for (const f of flags) {
    counts[f.severity]++;
    raw += WEIGHT[f.severity];
  }
  const risk = Math.min(100, raw * 4);
  let verdict: Analysis["verdict"] = "standard";
  if (counts.critical > 0 || risk > 70) verdict = "high_risk";
  else if (risk > 40) verdict = "negotiate";
  else if (risk > 15) verdict = "review";
  const labels = {
    standard: "Looks fairly standard",
    review: "Review carefully",
    negotiate: "Negotiate before signing",
    high_risk: "High risk: get professional advice",
  };
  return { counts, risk, verdict, verdictLabel: labels[verdict] };
}

// ---------- main ----------

export async function analyzeText(text: string, language = "English"): Promise<Analysis> {
  const clean = text.replace(/\r/g, "").trim();
  if (clean.length < 200) throw new Error("Document is too short or no text could be read.");

  const allChunks = chunkText(clean);
  const chunks = allChunks.slice(0, MAX_CHUNKS);
  const normalizedSource = norm(clean);

  const found: Flag[] = [];
  for (const chunk of chunks) {
    try {
      const out = await chatJson<{ flags?: any[] }>(FLAG_SYSTEM, `EXCERPT:\n"""\n${chunk}\n"""`);
      for (const f of out.flags ?? []) {
        if (!f?.quote || !SEVERITIES.includes(f.severity)) continue;
        if (!quoteExists(String(f.quote), normalizedSource)) continue; // drop hallucinations
        found.push({
          clauseType: String(f.clauseType ?? "other"),
          quote: String(f.quote),
          explanation: String(f.explanation ?? ""),
          severity: f.severity,
          whyItMatters: String(f.whyItMatters ?? ""),
          suggestedChange: String(f.suggestedChange ?? ""),
        });
      }
    } catch (e) {
      console.error("chunk failed:", (e as Error).message);
    }
  }

  // de-duplicate by normalized quote
  const seen = new Set<string>();
  const flags = found
    .filter((f) => {
      const k = norm(f.quote).slice(0, 80);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => WEIGHT[b.severity] - WEIGHT[a.severity]);

  const flagList = flags
    .slice(0, 12)
    .map((f) => `- [${f.severity}] ${f.clauseType}: ${f.explanation}`)
    .join("\n");

  let docType = "unknown";
  let summary: string[] = [];
  let questionsToAsk: string[] = [];
  try {
    const s = await chatJson<any>(
      SUMMARY_SYSTEM(language),
      `DOCUMENT START:\n"""\n${clean.slice(0, 5000)}\n"""\n\nRISKY CLAUSES FOUND:\n${flagList || "(none)"}`
    );
    docType = String(s.docType ?? "unknown");
    summary = Array.isArray(s.summary) ? s.summary.map(String) : [];
    questionsToAsk = Array.isArray(s.questionsToAsk) ? s.questionsToAsk.map(String) : [];
  } catch (e) {
    console.error("summary failed:", (e as Error).message);
  }

  return {
    docType,
    language,
    ...score(flags),
    summary,
    questionsToAsk,
    flags,
    chunksAnalyzed: chunks.length,
    truncated: allChunks.length > MAX_CHUNKS,
  };
}
