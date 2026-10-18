# ClauseCheck

Upload a contract, policy or terms and conditions and get a plain-language summary, flagged risky clauses (with the exact quote from the document), and a risk rating. Runs on an open-weight model (Gemma via Ollama), so documents can stay on your machine.

## How it works
1. Extract text (PDF, DOCX, TXT, or pasted).
2. Split into sections and ask Gemma to flag risky clauses as strict JSON.
3. **Verify** every flagged quote really exists in the document (drops hallucinations).
4. Score deterministically in code (the LLM labels, code rates).
5. Ask Gemma for a simple summary and questions to ask, in your language.

## Run it
```bash
# 1. Ollama + Gemma
ollama pull gemma3:4b

# 2. Backend
cd server && npm install && cp .env.example .env && npm run dev

# 3. Frontend (new terminal)
cd client && npm install && npm run dev
```
Open http://localhost:5173 and try `sample-rental-agreement.txt`.

## Config (server/.env)
- `OLLAMA_MODEL` gemma3:4b (fast) or gemma3:12b (better)
- `MONGODB_URI` optional MongoDB Atlas URI to save analyses

## Disclaimer
General information, not legal advice.

## Roadmap
Document-type rubrics (rental, loan, employment, insurance), missing-protection detection, highlighted split view, PDF export, Q&A chat, Atlas Vector Search.

## Contributing
PRs welcome. Good first issues: add rubrics for new document types, add test documents, improve prompts. Licensed MIT.
