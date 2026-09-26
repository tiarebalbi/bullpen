import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isProductionHost } from "./app/lib/productionHost.js";

// page.tsx is `force-static`, so generateMetadata can't read the request
// host to decide noindex per-host -- this proxy (Next 16's renamed
// "middleware") is the one place that sees the real incoming Host header
// on every request.
export function proxy(request: NextRequest): NextResponse {
  const response = NextResponse.next();
  if (!isProductionHost(request.headers.get("host"))) {
    response.headers.set("X-Robots-Tag", "noindex");
  }
  return response;
}

export const config = {
  // Every request-handling call counts against the Hobby plan's function
  // invocation allowance (see cost/allowances.json's vercel-hobby entry) --
  // skip static assets and the icon, which never need this header anyway.
  matcher: ["/((?!_next/static|_next/image|icon\\.svg|favicon\\.ico).*)"],
};
