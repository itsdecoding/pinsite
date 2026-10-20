import { NextRequest } from "next/server";
import { getWebsitePreviewBySlug, incrementPreviewViewCount } from "@/lib/preview/db";
import { renderPreviewHtml } from "@/lib/preview/renderer";
import { RESERVED_SLUGS } from "@/lib/preview/slug";

export const dynamic = "force-dynamic";

function renderNotFoundResponse(): Response {
  const notFoundHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Website Not Found | Pinsite Agency</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #090D1A;
    color: #F8FAFC;
    font-family: "Plus Jakarta Sans", system-ui, sans-serif;
    padding: 24px;
    box-sizing: border-box;
    text-align: center;
  }
  .card {
    max-width: 480px;
    background: rgba(15, 23, 42, 0.75);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 24px;
    padding: 48px 32px;
    backdrop-filter: blur(16px);
    box-shadow: 0 24px 60px -20px rgba(0,0,0,0.7);
  }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: rgba(249, 87, 33, 0.15);
    color: #F95721;
    font-size: 12px;
    font-weight: 700;
    padding: 4px 12px;
    border-radius: 999px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 20px;
  }
  h1 {
    font-size: 32px;
    font-weight: 700;
    margin: 0 0 12px;
    line-height: 1.15;
    letter-spacing: -0.02em;
  }
  p {
    color: #94A3B8;
    font-size: 16px;
    line-height: 1.55;
    margin: 0 0 28px;
  }
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    background: #F95721;
    color: #fff;
    text-decoration: none;
    font-weight: 600;
    font-size: 15px;
    padding: 12px 24px;
    border-radius: 999px;
    transition: transform 0.2s, background 0.2s;
  }
  .btn:hover {
    background: #ea4610;
    transform: translateY(-2px);
  }
  .foot {
    margin-top: 32px;
    font-size: 13px;
    color: #64748B;
  }
</style>
</head>
<body>
  <div class="card">
    <div class="pill">Pinsite Agency</div>
    <h1>Website Not Found</h1>
    <p>This custom website preview may have been updated, archived, or the link has a slight typo. Reach out directly to your Pinsite account team to restore it.</p>
    <a class="btn" href="https://wa.me/918080630000?text=Hi%20Pinsite%2C%20I%20am%20looking%20for%20my%20website%20preview%20link." target="_blank" rel="noopener noreferrer">
      <span>Chat with Pinsite on WhatsApp</span>
    </a>
    <div class="foot">Pinsite Design &amp; Technology Studio</div>
  </div>
</body>
</html>`;

  return new Response(notFoundHtml, {
    status: 404,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(
  req: NextRequest,
  context: { params: { slug: string } }
) {
  try {
    const params = await context.params;
    const slug = params?.slug?.toLowerCase();

    // 1. Guard against reserved system paths
    if (!slug || RESERVED_SLUGS.has(slug)) {
      return renderNotFoundResponse();
    }

    // 2. Fetch preview record from Supabase
    const record = await getWebsitePreviewBySlug(slug);
    if (!record || !record.site_data) {
      return renderNotFoundResponse();
    }

    // 3. Asynchronously increment view count in the background
    incrementPreviewViewCount(slug).catch((err) => {
      console.error(`Failed to bump view count for ${slug}:`, err);
    });

    // 4. Compile the HTML
    const html = renderPreviewHtml(record.site_data);

    // 5. Deliver compiled response in < 30ms with edge cache headers
    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=60, stale-while-revalidate=600",
        "X-Frame-Options": "SAMEORIGIN",
      },
    });
  } catch (error: any) {
    console.error("Preview render error:", error);
    return renderNotFoundResponse();
  }
}
