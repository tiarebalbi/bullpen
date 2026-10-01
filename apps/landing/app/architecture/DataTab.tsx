"use client";

import type { ReactNode } from "react";
import type { DataView } from "../../lib/architecturePage.js";
import { Chip } from "../components/ui.js";

const PREVIEW_PART = 3;

/**
 * Before Part 3 there is no database at all, so this tab says so and shows
 * the planned ones as a preview. From Part 3 it lists each planned database
 * with the service that owns it. Nothing here is filled in for a part that
 * has nothing to show.
 */
export function DataTab({
  part,
  data,
  preview,
  onJump,
}: {
  part: number;
  data: DataView;
  /** Part 3's planned databases, for the preview beside the empty state. */
  preview: DataView;
  onJump: (part: number) => void;
}): ReactNode {
  if (!data.reached) {
    return (
      <section aria-labelledby="bp-ap-data-h" className="bp-ap-notreached">
        <div>
          <div className="bp-eyebrow">Not reached at Part {part}</div>
          <h2 id="bp-ap-data-h">Data ownership arrives in Part {PREVIEW_PART}</h2>
          <p className="bp-ap-notreached__body">
            Through Part 2 Bullpen has no database: prices are fetched live and cached for 300 seconds. In Part {PREVIEW_PART} the
            price service splits in two, and each half gets its own database.
          </p>
          <div className="bp-ap-label">This tab will show</div>
          <ul className="bp-ap-list bp-ap-list--arrows">
            <li>Each database attached to exactly one service</li>
            <li>Which service owns which database</li>
          </ul>
          <button type="button" className="bp-ap-cta" onClick={() => onJump(PREVIEW_PART)}>
            Jump to Part {PREVIEW_PART}
          </button>
        </div>
        <div className="bp-ap-notreached__preview" aria-label="Preview of the planned databases">
          <Chip tone="outline">Preview · planned</Chip>
          <ul className="bp-ap-dblist">
            {preview.databases.map((db) => (
              <li key={db.id}>
                <span className="bp-ap-dblist__name">{db.label}</span>
                <span className="bp-ap-muted">{db.ownerLabel ? `owned by ${db.ownerLabel}` : "no owner yet"}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="bp-ap-data-h">
      <div className="bp-ap-tabhead">
        <div>
          <div className="bp-eyebrow">Data · Part {part}</div>
          <h2 id="bp-ap-data-h">One owner per database</h2>
        </div>
        <p className="bp-ap-tabhead__help">Every database below hangs off one service. These are planned, not built.</p>
      </div>
      <p>
        <Chip tone="outline">Preview · planned</Chip>
      </p>
      <div className="bp-ap-cards">
        {data.databases.map((db) => (
          <article key={db.id} className="bp-ap-card bp-ap-card--planned">
            <header className="bp-ap-card__head">
              <div>
                <div className="bp-ap-label">Planned · {db.meta}</div>
                <h3>{db.label}</h3>
              </div>
            </header>
            <p className="bp-ap-card__purpose">{db.purpose}</p>
            <div>
              <div className="bp-ap-label">Owner</div>
              <p>{db.ownerLabel ?? <span className="bp-ap-muted">No owner recorded.</span>}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
