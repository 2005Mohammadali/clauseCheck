import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import mammoth from "mammoth";
import { createRequire } from "node:module";
import { analyzeText } from "./analyze";
import { saveAnalysis, listAnalyses } from "./db";

const require = createRequire(import.meta.url);
// import the inner file: pdf-parse's index.js runs a debug routine under ESM
const pdfParse = require("pdf-parse/lib/pdf-parse.js");

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

async function extractText(file?: Express.Multer.File, pasted?: string): Promise<string> {
  if (pasted && pasted.trim()) return pasted;
  if (!file) throw new Error("Upload a file or paste the document text.");
  const name = file.originalname.toLowerCase();
  if (name.endsWith(".pdf")) return (await pdfParse(file.buffer)).text;
  if (name.endsWith(".docx")) return (await mammoth.extractRawText({ buffer: file.buffer })).value;
  if (name.endsWith(".txt") || name.endsWith(".md")) return file.buffer.toString("utf8");
  throw new Error("Unsupported file type. Use PDF, DOCX, TXT, or paste the text.");
}

app.post("/api/analyze", upload.single("file"), async (req, res) => {
  try {
    const text = await extractText(req.file, req.body?.text);
    const language = (req.body?.language as string) || "English";
    const analysis = await analyzeText(text, language);
    const id = await saveAnalysis(req.file?.originalname ?? "pasted text", analysis);
    res.json({ id, ...analysis });
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: (e as Error).message });
  }
});

app.get("/api/analyses", async (_req, res) => res.json(await listAnalyses()));
app.get("/api/health", (_req, res) => res.json({ ok: true }));

const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => console.log(`ClauseCheck API on http://localhost:${port}`));
