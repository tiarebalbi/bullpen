import type { ReactNode } from "react";
import type { Adl } from "../../lib/adl.js";
import type { CheckArchResult } from "../../lib/check-arch.js";
import { Chip } from "./ui.js";

export function Rules({ adl, checkArch }: { adl: Adl; checkArch: CheckArchResult }): ReactNode {
  return (
    <section id="rules" className="bp-section bp-section--sunken" aria-labelledby="rules-heading">
      <div className="bp-section__head">
        <div className="bp-eyebrow">Rules</div>
        <h2 id="rules-heading">What the codebase must hold to</h2>
        <p className="bp-section__lede">
          Parsed from <code>architecture/adl/structure.adl</code> — {adl.description}.
        </p>
      </div>

      <div className="bp-rules-grid">
        <div>
          <h3 className="bp-rules-subhead">Structure</h3>
          <table className="bp-table">
            <thead>
              <tr>
                <th scope="col">Kind</th>
                <th scope="col">Name</th>
                <th scope="col">Path</th>
              </tr>
            </thead>
            <tbody>
              {adl.entries.map((entry) => (
                <tr key={entry.path}>
                  <td>{entry.kind}</td>
                  <td>{entry.name}</td>
                  <td>
                    <code>{entry.path}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <h3 className="bp-rules-subhead">Asserted rules</h3>
          <ul className="bp-rules-list">
            {adl.rules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="bp-check-arch">
        <div className="bp-check-arch__head">
          <h3 className="bp-rules-subhead">Last check:arch run</h3>
          <Chip tone={checkArch.passed ? "gain" : "loss"}>{checkArch.passed ? "PASSED" : "FAILED"}</Chip>
          <span className="bp-check-arch__time">{checkArch.ranAt}</span>
        </div>
        <code className="bp-check-arch__command">$ {checkArch.command}</code>
        <pre className="bp-check-arch__output">{checkArch.output}</pre>
      </div>
    </section>
  );
}
