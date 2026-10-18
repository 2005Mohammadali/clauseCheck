import { useState } from "react";

type Severity = "low" | "medium" | "high" | "critical";
interface Flag {
  clauseType: string;
  quote: string;
  explanation: string;
  severity: Severity;
  whyItMatters: string;
  suggestedChange: string;
}
interface Result {
  docType: string;
  risk: number;
  verdict: "standard" | "review" | "negotiate" | "high_risk";
  verdictLabel: string;
  counts: Record<Severity, number>;
  summary: string[];
  questionsToAsk: string[];
  flags: Flag[];
  chunksAnalyzed: number;
  truncated: boolean;
}

const LANGUAGES = ["English", "Hindi", "Marathi", "Tamil", "Bengali", "Spanish"];

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [language, setLanguage] = useState("English");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  async function analyze() {
    setError("");
    setResult(null);
    if (!file && !text.trim()) {
      setError("Upload a document or paste its text first.");
      return;
    }
    setLoading(true);
    try {
      const form = new FormData();
      if (file) form.append("file", file);
      if (text.trim()) form.append("text", text);
      form.append("language", language);
      const res = await fetch("/api/analyze", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Analysis failed");
      setResult(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <header>
        <h1>ClauseCheck</h1>
        <p>Upload a contract, policy, or terms and conditions. See what it really says and which parts could cost you.</p>
      </header>

      <section className="panel">
        <label className="drop">
          <input
            type="file"
            accept=".pdf,.docx,.txt,.md"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <span>{file ? file.name : "Choose a PDF, DOCX or TXT file"}</span>
        </label>
        <p className="or">or paste the text</p>
        <textarea
          rows={6}
          placeholder="Paste the agreement text here"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="row">
          <label>
            Explain in{" "}
            <select value={language} onChange={(e) => setLanguage(e.target.value)}>
              {LANGUAGES.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
          <button onClick={analyze} disabled={loading}>
            {loading ? "Reading your document…" : "Check this document"}
          </button>
        </div>
        {loading && <p className="hint">Gemma is reading clause by clause. This can take 1 to 3 minutes on a laptop.</p>}
        {error && <p className="error">{error}</p>}
      </section>

      {result && (
        <main>
          <section className={`verdict v-${result.verdict}`}>
            <div>
              <div className="vlabel">{result.verdictLabel}</div>
              <div className="vmeta">{result.docType}</div>
            </div>
            <div className="score">
              <strong>{result.risk}</strong>
              <span>/ 100 risk</span>
            </div>
          </section>

          <div className="counts">
            {(["critical", "high", "medium", "low"] as Severity[]).map((s) => (
              <span key={s} className={`pill s-${s}`}>
                {result.counts[s]} {s}
              </span>
            ))}
          </div>

          {result.truncated && (
            <p className="hint">Only the first {result.chunksAnalyzed} sections were analysed because the document is long.</p>
          )}

          <h2>What this document says</h2>
          <ul className="plain">
            {result.summary.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>

          <h2>Clauses to watch ({result.flags.length})</h2>
          {result.flags.length === 0 && <p>No risky clauses were found. Still read the document yourself before signing.</p>}
          {result.flags.map((f, i) => (
            <article key={i} className={`flag s-${f.severity}`}>
              <div className="fhead">
                <span className={`pill s-${f.severity}`}>{f.severity}</span>
                <span className="ftype">{f.clauseType.replace(/_/g, " ")}</span>
              </div>
              <blockquote>{f.quote}</blockquote>
              <p>{f.explanation}</p>
              {f.whyItMatters && (
                <p>
                  <b>How you could lose out:</b> {f.whyItMatters}
                </p>
              )}
              {f.suggestedChange && (
                <p>
                  <b>Ask for:</b> {f.suggestedChange}
                </p>
              )}
            </article>
          ))}

          {result.questionsToAsk.length > 0 && (
            <>
              <h2>Questions to ask before signing</h2>
              <ul className="plain">
                {result.questionsToAsk.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </>
          )}
        </main>
      )}

      <footer>
        ClauseCheck gives general information, not legal advice. It can miss clauses. For anything important, ask a qualified lawyer.
      </footer>
    </div>
  );
}
