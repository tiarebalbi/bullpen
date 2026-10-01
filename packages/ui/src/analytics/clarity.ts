export const CLARITY_SCRIPT_ID = "clarity-script";

type ClarityFn = ((...args: unknown[]) => void) & { q?: unknown[] };
interface ClarityWindow {
  clarity?: ClarityFn;
}

const clarityWindow = (): ClarityWindow => window as unknown as ClarityWindow;

export function clarityLoaded(): boolean {
  return document.getElementById(CLARITY_SCRIPT_ID) !== null;
}

/**
 * Clarity's own bootstrap (the queue stub, then the tag), with the Consent
 * API v2 call queued first: advertising storage denied, analytics storage
 * granted. Call it only after the visitor accepted. `part` is the Clarity
 * tag naming the part of the series this deployment belongs to.
 */
export function loadClarity(projectId: string, part: number | null): void {
  if (clarityLoaded()) return;
  const w = clarityWindow();
  const stub: ClarityFn =
    w.clarity ??
    function clarity(): void {
      // The tag drains this queue of `arguments` objects once it loads.
      // eslint-disable-next-line prefer-rest-params
      (stub.q = stub.q ?? []).push(arguments);
    };
  w.clarity = stub;
  stub("consentv2", { ad_Storage: "denied", analytics_Storage: "granted" });
  if (part !== null) stub("set", "part", String(part));

  const script = document.createElement("script");
  script.id = CLARITY_SCRIPT_ID;
  script.async = true;
  script.src = `https://www.clarity.ms/tag/${encodeURIComponent(projectId)}`;
  document.head.appendChild(script);
}

/** Clarity's documented way to erase its cookies and stop tracking until consent is granted again. */
export function eraseClarity(): void {
  clarityWindow().clarity?.("consent", false);
}
