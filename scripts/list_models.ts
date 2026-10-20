import fs from "fs";
import path from "path";

const envPath = path.join(process.cwd(), ".env.local");
const content = fs.readFileSync(envPath, "utf-8");
let apiKey = "";
for (const line of content.split("\n")) {
  if (line.trim().startsWith("GEMINI_API_KEY=")) {
    apiKey = line.trim().split("=")[1].trim();
  }
}

async function listModels() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  const data = await res.json();
  if (data.models) {
    const flashModels = data.models
      .map((m: any) => m.name)
      .filter((n: string) => n.includes("flash") || n.includes("pro") || n.includes("3."));
    console.log("Available matching models:", flashModels);
  } else {
    console.log("No models field:", data);
  }
}

listModels().catch(console.error);
