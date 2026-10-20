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

async function testGemini() {
  console.log("Testing Gemini API Key with gemini-3.8-flash...");
  const model = "gemini-3.8-flash";

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "Respond with the single word: READY" }] }],
      }),
    });

    const json = await res.json();
    if (res.ok) {
      console.log(`✅ Model "${model}" is ACTIVE and WORKING!`);
      console.log("Response text:", json.candidates?.[0]?.content?.parts?.[0]?.text?.trim());
      process.exit(0);
    } else {
      console.error(`Model "${model}" error:`, json.error?.message || json);
      process.exit(1);
    }
  } catch (e: any) {
    console.error(`Error testing ${model}:`, e.message);
    process.exit(1);
  }
}

testGemini();
