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

async function testCandidates() {
  const models = [
    "gemini-3.5-flash",
    "gemini-3.7-flash",
    "gemini-3-flash-preview",
    "gemini-3.8-flash"
  ];

  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "ping" }] }],
        }),
        signal: AbortSignal.timeout(5000),
      });
      console.log(`Model ${model}: Status ${res.status}`);
      if (!res.ok) {
        const t = await res.text();
        console.log(`  Details: ${t.slice(0, 100)}`);
      } else {
        const d = await res.json();
        console.log(`  SUCCESS! Response: ${d.candidates?.[0]?.content?.parts?.[0]?.text?.trim()}`);
      }
    } catch (e: any) {
      console.log(`Model ${model}: Error -> ${e.message}`);
    }
  }
}

testCandidates();
