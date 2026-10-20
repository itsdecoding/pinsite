import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

// Read .env.local manually
const envPath = path.join(process.cwd(), ".env.local");
const envContent = fs.readFileSync(envPath, "utf-8");

let supabaseUrl = "";
let serviceKey = "";

for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (trimmed.startsWith("NEXT_PUBLIC_SUPABASE_URL=")) {
    supabaseUrl = trimmed.split("=")[1].trim();
  }
  if (trimmed.startsWith("SUPABASE_SERVICE_ROLE_KEY=")) {
    serviceKey = trimmed.split("=")[1].trim();
  }
}

if (!supabaseUrl || !serviceKey) {
  console.error("Missing Supabase credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

async function check() {
  const { data, error } = await supabase.from("website_previews").select("id").limit(1);
  if (error) {
    console.log("Table check status: NOT_FOUND (needs migration)");
    console.log("Error details:", error.message);
  } else {
    console.log("Table check status: EXISTS");
  }
}

check().catch((err) => {
  console.error("Execution error:", err);
  process.exit(1);
});
