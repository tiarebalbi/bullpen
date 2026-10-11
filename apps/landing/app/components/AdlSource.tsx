import type { CSSProperties, ReactNode } from "react";
import type { AdlToken, AdlTokenKind } from "../../lib/adl.js";

/**
 * structure.adl, highlighted. The parser has already said what each piece of
 * a line is (keyword, name, path, comment, or plain text); this only draws
 * it. It adds and removes nothing, so the text of a line is the line as
 * written, and the colours are the design system's own tokens (see
 * `.bp-adl` in landing.css).
 */

export const ADL_TOKEN_CLASS: Record<AdlTokenKind, string> = {
  keyword: "bp-adl__keyword",
  name: "bp-adl__name",
  path: "bp-adl__path",
  comment: "bp-adl__comment",
  text: "bp-adl__text",
};

export interface AdlSourceLineData {
  raw: string;
  tokens: AdlToken[];
}

/** How many columns a line is indented, so a wrapped line can hang under it. */
const indentOf = (raw: string): number => raw.length - raw.trimStart().length;

export function AdlTokens({ tokens }: { tokens: AdlToken[] }): ReactNode {
  return tokens.map((token, index) => (
    <span key={index} className={ADL_TOKEN_CLASS[token.kind]} data-token={token.kind}>
      {token.text}
    </span>
  ));
}

/** One line, with a hanging indent: a long line wraps under its own text, not under its margin. */
export function AdlLineText({ line }: { line: AdlSourceLineData }): ReactNode {
  return (
    <div className="bp-adl__line" style={{ "--indent": indentOf(line.raw) } as CSSProperties}>
      <AdlTokens tokens={line.tokens} />
    </div>
  );
}

/** A run of lines of the file, as written. */
export function AdlSource({ lines, label }: { lines: Array<AdlSourceLineData & { number: number }>; label?: string }): ReactNode {
  return (
    <div className="bp-adl" role="group" aria-label={label}>
      {lines.map((line) => (
        <div key={line.number} data-line={line.number} className="bp-adl__row">
          <AdlLineText line={line} />
        </div>
      ))}
    </div>
  );
}
