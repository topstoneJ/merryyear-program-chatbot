import { NextResponse, type NextRequest } from "next/server";

// The Cloudflare worker is not executed by Next.js on Azure or localhost.
export function proxy(request: NextRequest) {
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const origin = request.headers.get("origin");
    let denied = request.headers.get("sec-fetch-site") === "cross-site";
    if (origin) {
      try {
        const parsed = new URL(origin);
        const host = request.headers.get("host") || new URL(request.url).host;
        denied ||= !["http:", "https:"].includes(parsed.protocol) || parsed.host !== host;
      } catch { denied = true; }
    }
    if (denied) return Response.json({ error: "허용되지 않은 요청입니다." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.next();
}

export const config = { matcher: "/api/:path*" };
