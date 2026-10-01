"use client";

import type { ReactNode } from "react";
import type { ServiceRule, ServicesView } from "../../lib/architecturePage.js";
import { adrHashId } from "../../lib/adrHashId.js";
import { Chip } from "../components/ui.js";

function RuleChip({ passed }: { passed: boolean | null }): ReactNode {
  if (passed === null) return <Chip tone="neutral">no result</Chip>;
  return <Chip tone={passed ? "gain" : "loss"}>{passed ? "✓ pass" : "✕ fail"}</Chip>;
}

function Rules({ rules, part }: { rules: ServiceRule[]; part: number }): ReactNode {
  if (rules.length === 0) return <p className="bp-ap-muted">No rule is checked against it at Part {part}.</p>;
  return (
    <ul className="bp-ap-rules">
      {rules.map((rule) => (
        <li key={`${rule.check}:${rule.name}`}>
          <RuleChip passed={rule.passed} />
          <span>
            {rule.name}
            <span className="bp-ap-muted"> · {rule.check}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

const COUNT_WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight"];

export function ServicesTab({
  part,
  services,
  since,
  onOpenNode,
}: {
  part: number;
  services: ServicesView;
  /** The first part each service id appears in, from the explorer content. */
  since: Record<string, number>;
  onOpenNode: (id: string) => void;
}): ReactNode {
  const builtCount = services.built.length;
  const plannedCount = services.planned.length;

  return (
    <section aria-labelledby="bp-ap-services-h">
      <div className="bp-ap-tabhead">
        <div>
          <div className="bp-eyebrow">Services · Part {part}</div>
          <h2 id="bp-ap-services-h">
            {COUNT_WORDS[builtCount] ?? builtCount} {builtCount === 1 ? "service runs" : "services run"} today
          </h2>
        </div>
        <p className="bp-ap-tabhead__help">
          What each one runs on, what it owns, how it is reached, and whether its rules pass.
          {plannedCount > 0 ? ` ${COUNT_WORDS[plannedCount] ?? plannedCount} more ${plannedCount === 1 ? "is" : "are"} planned for this part.` : ""}
        </p>
      </div>

      <div className="bp-ap-cards">
        {services.built.map((service) => (
          <article key={service.id} className="bp-ap-card" aria-labelledby={`bp-ap-svc-${service.id}`}>
            <header className="bp-ap-card__head">
              <div>
                <div className="bp-ap-label">Since Part {since[service.id] ?? 1}</div>
                <h3 id={`bp-ap-svc-${service.id}`}>{service.name}</h3>
              </div>
              {service.runtime ? <Chip tone="neutral">{service.runtime}</Chip> : null}
            </header>
            <p className="bp-ap-card__purpose">{service.purpose}</p>

            <div>
              <div className="bp-ap-label">Owns</div>
              {service.owns.length > 0 ? (
                <ul className="bp-ap-list">
                  {service.owns.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="bp-ap-muted">Nothing recorded.</p>
              )}
            </div>

            <div>
              <div className="bp-ap-label">Interfaces</div>
              {service.interfaces.length > 0 ? (
                <ul className="bp-ap-ifaces">
                  {service.interfaces.map((iface) => (
                    <li key={`${iface.direction}:${iface.peer}`}>
                      <span className="bp-ap-ifaces__dir">{iface.direction === "in" ? "IN" : "OUT"}</span>
                      <span>
                        {iface.peer}
                        <span className="bp-ap-muted"> · {iface.how}</span>
                      </span>
                      {iface.mode ? <Chip tone="outline">{iface.mode}</Chip> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="bp-ap-muted">None recorded.</p>
              )}
            </div>

            <div>
              <div className="bp-ap-label">Rules</div>
              <Rules rules={service.rules} part={part} />
            </div>

            <div>
              <div className="bp-ap-label">Cost</div>
              <p className="bp-ap-muted">Estimate arrives in Part 5</p>
            </div>

            <footer className="bp-ap-card__foot">
              <span>
                {service.adrs.length > 0 ? (
                  service.adrs.map((id, index) => (
                    <span key={id}>
                      {index > 0 ? " · " : ""}
                      <a href={`#${adrHashId(id)}`} className="bp-ap-adr">
                        {id}
                      </a>
                    </span>
                  ))
                ) : (
                  <span className="bp-ap-muted">ADR pending</span>
                )}
              </span>
              <button type="button" className="bp-ap-link" onClick={() => onOpenNode(service.id)}>
                See it in the overview →
              </button>
            </footer>
          </article>
        ))}
      </div>

      {plannedCount > 0 ? (
        <>
          <h3 className="bp-ap-subhead">Planned for Part {part}</h3>
          <div className="bp-ap-cards bp-ap-cards--planned">
            {services.planned.map((service) => (
              <article key={service.id} className="bp-ap-card bp-ap-card--planned" aria-labelledby={`bp-ap-svc-${service.id}`}>
                <header className="bp-ap-card__head">
                  <div>
                    <div className="bp-ap-label">Planned · Part {service.arrives}</div>
                    <h4 id={`bp-ap-svc-${service.id}`}>{service.name}</h4>
                  </div>
                  <Chip tone="outline">{service.runtime}</Chip>
                </header>
                <p className="bp-ap-card__purpose">{service.purpose}</p>
              </article>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
