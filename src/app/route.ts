import { NextResponse } from "next/server";
import { LANDING_HTML } from "@/lib/landingHtml";

export const dynamic = "force-static";

export async function GET() {
  return new NextResponse(LANDING_HTML, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
