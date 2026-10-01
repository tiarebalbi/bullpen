interface CookieJar {
  cookie: string;
}

function cookieNames(jar: CookieJar): string[] {
  return jar.cookie
    .split(";")
    .map((part) => part.split("=")[0]!.trim())
    .filter(Boolean);
}

function isIpOrSingleLabel(host: string): boolean {
  return !host.includes(".") || /^[\d.]+$/.test(host) || host.includes(":");
}

/** The host and each parent domain with at least two labels: a.b.example.com -> a.b.example.com, b.example.com, example.com. */
export function domainsFor(host: string): string[] {
  if (isIpOrSingleLabel(host)) return [host];
  const labels = host.split(".");
  const domains: string[] = [];
  for (let i = 0; i <= labels.length - 2; i += 1) domains.push(labels.slice(i).join("."));
  return domains;
}

function expire(jar: CookieJar, name: string, domain: string | null): void {
  const parts = [`${name}=`, "Max-Age=0", "Expires=Thu, 01 Jan 1970 00:00:00 GMT", "Path=/"];
  if (domain) parts.push(`Domain=${domain}`);
  jar.cookie = parts.join("; ");
}

const GOOGLE_COOKIE = /^_ga(?:_|$)|^_gid$|^_gat/;
const CLARITY_COOKIE = /^_clck$|^_clsk$/;

/**
 * Deletes the first-party cookies GA4 and Clarity wrote. Google's are only
 * ever set on this app's own host (cookie_domain), so only the host is
 * tried: a parent-domain `_ga` belongs to another site. Clarity writes its
 * two cookies on the parent domain, so each parent is tried. Clarity's
 * third-party cookies live on Microsoft's domains and cannot be reached from
 * here.
 */
export function clearAnalyticsCookies(jar: CookieJar, host: string): void {
  for (const name of cookieNames(jar)) {
    if (GOOGLE_COOKIE.test(name)) {
      expire(jar, name, null);
      expire(jar, name, host);
    } else if (CLARITY_COOKIE.test(name)) {
      expire(jar, name, null);
      for (const domain of domainsFor(host)) expire(jar, name, domain);
    }
  }
}
