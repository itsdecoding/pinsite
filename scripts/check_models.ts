import fs from "fs";
import path from "path";

// Read API key from .env.local
const envPath = path.join(process.cwd(), ".env.local");
const content = fs.readFileSync(envPath, "utf-8");
let apiKey = "";
for (const line of content.split("\n")) {
  if (line.trim().startsWith("GEMINI_API_KEY=")) {
    apiKey = line.trim().split("=")[1].trim();
  }
}

async function checkModels() {
  const models = [
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-flash",
    "gemini-1.5-flash-latest",
    "gemini-3.8-flash"
  ];

  for (const m of models) {
    process.stdout.write(`Testing ${m}... `);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "hi" }] }],
        }),
        signal: AbortSignal.timeout(8000),
      });

      const body = await res.text();
      if (res.ok) {
        console.log(`✅ OK (${res.status})`);
      } else {
        console.log(`❌ Error ${res.status}: ${body.slice(0, 100)}`);
      }
    } catch (e: any) {
      console.log(`⚠️ Exception: ${e.message}`);
    }
  }
}

checkModels();
