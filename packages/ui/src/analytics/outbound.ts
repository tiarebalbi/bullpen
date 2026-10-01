"use client";

import { useEffect } from "react";
import { track } from "./track.js";

/** The host of a link that leaves this site; null for same-site links, and for anything that is not http(s). Never the path or query. */
export function outboundHost(href: string, currentHost: string): string | null {
  try {
    const url = new URL(href, `https://${currentHost}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.host === currentHost ? null : url.host;
  } catch {
    return null;
  }
}

/** Reports `outbound_click` for any click on a link to another site, from one listener on the document. */
export function useOutboundClickTracking(): void {
  useEffect(() => {
    const onClick = (event: MouseEvent): void => {
      if (!(event.target instanceof Element)) return;
      const anchor = event.target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor) return;
      const host = outboundHost(anchor.href, window.location.host);
      if (host) track("outbound_click", { host });
    };
    document.addEventListener("click", onClick);
    document.addEventListener("auxclick", onClick);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("auxclick", onClick);
    };
  }, []);
}
