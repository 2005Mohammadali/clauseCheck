const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const MODEL = process.env.OLLAMA_MODEL ?? "gemma3:4b";

/** Calls Gemma through Ollama and returns parsed JSON (retries once on bad JSON). */
export async function chatJson<T = any>(system: string, user: string): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        stream: false,
        format: "json",
        options: { temperature: 0.1, num_ctx: 8192 },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) {
      throw new Error(
        `Ollama error ${res.status}. Is Ollama running and is "${MODEL}" pulled? ${await res.text()}`
      );
    }
    const data: any = await res.json();
    try {
      return JSON.parse(data.message.content) as T;
    } catch {
      // retry once
    }
  }
  throw new Error("Model returned invalid JSON twice");
}
