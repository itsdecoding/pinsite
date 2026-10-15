import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  url.pathname = "/joshi-clinic";
  return NextResponse.redirect(url, 301);
}
