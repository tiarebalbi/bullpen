"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { chipFor } from "../../lib/ruleChips.js";
import type { RuleTile, TileRow } from "../../lib/ruleTiles.js";
import { ADL_FILE_HASH } from "./RuleCardGrid.js";
import { AdlTokens } from "./AdlSource.js";
import { Chip } from "./ui.js";

function RowChip({ passed }: { passed: boolean | null }): ReactNode {
  const chip = chipFor(passed);
  // The chip's tint is see-through. On the open tile and the panel's footer the surface behind it is darker than the card, which took the
  // pass chip under 4.5:1 (axe: 4.2 and 3.83), so it sits on a pill of the card's own colour, where it was measured to pass.
  return (
    <span className="bp-chip-ground">
      <Chip tone={chip.tone}>{chip.label}</Chip>
    </span>
  );
}

function Row({ row, prose }: { row: TileRow; prose: boolean }): ReactNode {
  return (
    <div className={`bp-tile-row${prose ? " bp-tile-row--prose" : ""}`} data-rule={row.key}>
      <div className="bp-tile-row__text">{row.tokens ? <AdlTokens tokens={row.tokens} /> : row.text}</div>
      <RowChip passed={row.passed} />
    </div>
  );
}

/**
 * The eight Rules tiles and the one detail panel they share. A tile is a button (`aria-expanded`); opening it shows the panel below the
 * grid on a wide screen and right under the tile on a narrow one, moves focus into the panel, and "Close" or Escape closes it and puts
 * focus back on the tile.
 */
export function RuleTiles({ tiles }: { tiles: RuleTile[] }): ReactNode {
  const [openId, setOpenId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const tileRefs = useRef(new Map<string, HTMLButtonElement>());
  const base = useId();
  const open = tiles.find((tile) => tile.id === openId) ?? null;
  const openIndex = open ? tiles.indexOf(open) : -1;

  const close = (): void => {
    const id = openId;
    setOpenId(null);
    if (id) requestAnimationFrame(() => tileRefs.current.get(id)?.focus());
  };

  useEffect(() => {
    if (!openId) return;
    panelRef.current?.focus({ preventScroll: false });
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      const id = openId;
      setOpenId(null);
      requestAnimationFrame(() => tileRefs.current.get(id)?.focus());
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openId]);

  return (
    <>
      {tiles.map((tile, index) => {
        const chip = chipFor(tile.passed);
        const isOpen = tile.id === openId;
        return (
          <button
            key={tile.id}
            ref={(el) => {
              if (el) tileRefs.current.set(tile.id, el);
              else tileRefs.current.delete(tile.id);
            }}
            type="button"
            className="bp-tile"
            data-tile={tile.id}
            data-open={isOpen || undefined}
            aria-expanded={isOpen}
            aria-controls={isOpen ? `${base}-detail` : undefined}
            style={{ "--i": index } as CSSProperties}
            onClick={() => setOpenId(isOpen ? null : tile.id)}
          >
            <span className="bp-tile__top">
              <span className="bp-tile__count">{tile.countLabel}</span>
              <span className="bp-chip-ground">
                <Chip tone={chip.tone}>{chip.label}</Chip>
              </span>
            </span>
            <span className="bp-tile__title">
              {tile.title}
              {tile.sub ? <span className="bp-tile__sub"> ({tile.sub})</span> : null}
            </span>
            <span className="bp-tile__bottom">
              <span className="bp-tile__check">{tile.check}</span>
              <span className="bp-tile__label">{isOpen ? "Hide ↑" : "View →"}</span>
            </span>
          </button>
        );
      })}
      {open ? (
        <div
          ref={panelRef}
          id={`${base}-detail`}
          role="region"
          tabIndex={-1}
          aria-labelledby={`${base}-detail-title`}
          className="bp-tile-detail"
          data-detail={open.id}
          style={{ "--open": openIndex } as CSSProperties}
        >
          <div className="bp-tile-detail__bar">
            <span className="bp-tile-detail__file">
              {open.sourceFile}
              {open.sourceFile.endsWith(".adl") ? (
                <>
                  {" "}
                  ·{" "}
                  <a href={ADL_FILE_HASH} className="bp-tile-detail__view">
                    View structure.adl
                  </a>
                </>
              ) : null}
            </span>
            <button type="button" className="bp-tile-detail__close" onClick={close}>
              Close
            </button>
          </div>
          <h3 id={`${base}-detail-title`} className="bp-tile-detail__title">
            {open.title}
            {open.sub ? ` (${open.sub})` : ""}
          </h3>
          {open.head ? <div className="bp-tile-detail__head">{open.head}</div> : null}
          <div className="bp-tile-detail__rows">
            {open.rows.map((row) => (
              <Row key={row.key} row={row} prose={row.kind === "prose"} />
            ))}
          </div>
          {open.extraRows.length > 0 ? (
            <>
              <div className="bp-tile-detail__head">Also enforced here, with no line in structure.adl</div>
              <div className="bp-tile-detail__rows">
                {open.extraRows.map((row) => (
                  <Row key={row.key} row={row} prose />
                ))}
              </div>
            </>
          ) : null}
          <div className="bp-tile-detail__foot">
            <span>{open.check}</span>
            <span className="bp-tile-detail__result">
              <RowChip passed={open.passed} /> {open.result}
            </span>
          </div>
        </div>
      ) : null}
    </>
  );
}
