import { MongoClient, type Collection } from "mongodb";

let col: Collection | null = null;

async function getCollection(): Promise<Collection | null> {
  const uri = process.env.MONGODB_URI;
  if (!uri) return null; // Mongo is optional
  if (col) return col;
  const client = new MongoClient(uri);
  await client.connect();
  col = client.db(process.env.MONGODB_DB ?? "clausecheck").collection("analyses");
  return col;
}

export async function saveAnalysis(fileName: string, analysis: unknown) {
  try {
    const c = await getCollection();
    if (!c) return null;
    const r = await c.insertOne({ fileName, createdAt: new Date(), analysis });
    return String(r.insertedId);
  } catch (e) {
    console.error("mongo save failed:", (e as Error).message);
    return null;
  }
}

export async function listAnalyses() {
  try {
    const c = await getCollection();
    if (!c) return [];
    return await c
      .find({}, { projection: { fileName: 1, createdAt: 1, "analysis.verdictLabel": 1, "analysis.risk": 1 } })
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray();
  } catch {
    return [];
  }
}
