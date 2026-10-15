import fs from "fs";
import path from "path";

export const dynamic = "force-static";

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), "public", "joshi-clinic", "index.html");
    const html = fs.readFileSync(filePath, "utf-8");
    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    console.error("Failed to serve Joshi Dental Clinic HTML:", error);
    return new Response("Not found", { status: 404 });
  }
}
