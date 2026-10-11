"use client";

import type { ReactNode } from "react";
import type { AdlLine } from "../../lib/adl.js";
import type { RulesTabData } from "../../lib/rulesView.js";
import { AdlFileModal } from "../components/AdlFileModal.js";
import { AdlLineText } from "../components/AdlSource.js";
import { RuleCardGrid, type RuleCardView } from "../components/RuleCardGrid.js";
import { Chip } from "../components/ui.js";

function shortDate(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * The Rules cards from the home page, then every rule the last snapshot
 * ran with its check and result. A rule that only started failing builds in
 * a later part than the selected one is shown as arriving, not as passing.
 */
export function RulesTab({ part, cards, data, adl }: { part: number; cards: RuleCardView[]; data: RulesTabData; adl: { source: string; lines: AdlLine[] } }): ReactNode {
  const inForce = data.rows.filter((row) => row.since <= part);
  const passing = inForce.filter((row) => row.passed).length;
  const snapshot = data.snapshot;

  return (
    <section aria-labelledby="bp-ap-rules-h">
      <div className="bp-ap-tabhead">
        <div>
          <div className="bp-eyebrow">Rules · Part {part}</div>
          <h2 id="bp-ap-rules-h">Checked, not hoped for</h2>
        </div>
        <p className="bp-ap-tabhead__help">
          {snapshot ? `${passing} of ${inForce.length} rules passing at Part ${part}.` : "No snapshot has been committed yet, so nothing is claimed."}
        </p>
      </div>

      {snapshot ? (
        <p className="bp-ap-snapshot">
          <Chip tone={snapshot.passed ? "gain" : "loss"}>{snapshot.passed ? "every check passed" : "a check failed"}</Chip>{" "}
          Snapshot for Part {snapshot.part}, commit <code>{snapshot.commit.slice(0, 7)}</code>
          {snapshot.dirty ? " plus uncommitted changes" : ""}, {shortDate(snapshot.generatedAt)}.
        </p>
      ) : null}

      <RuleCardGrid cards={cards} part={part} />
      <AdlFileModal source={adl.source} lines={adl.lines} closeHash="#rules" />

      {data.rows.length > 0 ? (
        <>
          <h3 className="bp-ap-subhead">Every rule</h3>
          <div className="bp-ap-tablewrap">
            <table className="bp-table">
              <thead>
                <tr>
                  <th scope="col">Rule</th>
                  <th scope="col">Enforced by</th>
                  <th scope="col">Result</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.id} data-rule={row.id} data-later={row.since > part}>
                    <td>
                      {row.line ? (
                        <div className="bp-adl">
                          <AdlLineText line={row.line} />
                        </div>
                      ) : (
                        <code>{row.rule}</code>
                      )}
                    </td>
                    <td>{row.check}</td>
                    <td>
                      {row.since > part ? <Chip tone="outline">Arrives in Part {row.since}</Chip> : <Chip tone={row.passed ? "gain" : "loss"}>{row.passed ? "✓ pass" : "✕ fail"}</Chip>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="bp-ap-subhead">What ran</h3>
          <div className="bp-ap-tablewrap">
            <table className="bp-table">
              <thead>
                <tr>
                  <th scope="col">Command</th>
                  <th scope="col">Result</th>
                  <th scope="col">Output</th>
                </tr>
              </thead>
              <tbody>
                {data.commands.map((command) => (
                  <tr key={command.name}>
                    <td>
                      <code>{command.name}</code>
                    </td>
                    <td>
                      <Chip tone={command.passed ? "gain" : "loss"}>{command.passed ? "✓ pass" : "✕ fail"}</Chip>
                    </td>
                    <td className="bp-table__muted">{command.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  );
}
