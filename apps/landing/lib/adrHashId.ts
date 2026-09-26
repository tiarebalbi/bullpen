/**
 * "ADR-0002" -> "adr-0002", the URL hash slug used both by the Decisions
 * modal's deep link and the Architecture Explorer's side-panel ADR links.
 *
 * Kept in its own module (no fs/path imports) so Client Components can
 * import it directly -- importing it from adr.ts would pull that whole
 * module, and its node:fs/node:path imports, into the client bundle.
 */
export function adrHashId(id: string): string {
  return `adr-${id.replace("ADR-", "").toLowerCase()}`;
}
