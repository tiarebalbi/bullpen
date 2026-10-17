import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAdlDocument } from "./adl.js";
import { MIGRATION_FOLDER_RULE, checkDataOwnership } from "./data-ownership-check.js";
import { expectFailureFormat, realRepoRoot } from "./test-helpers.js";

const ADL = `DESCRIPTION Data ownership fixture
CATEGORY Structural
DEFINE SYSTEM Fixture AS fixture
  DEFINE COMPONENT Trading App AS apps/web
  DEFINE LIBRARY market-data AS packages/db-market-data
  DEFINE LIBRARY trading AS packages/db-trading

# Data ownership
ASSERT(ONLY market-data WRITES market_data)
ASSERT(trading READS market_data ONLY THROUGH market_data.prices_v1)
ASSERT(ONLY trading WRITES trading.orders AND trading.ledger)
`;

const WRITES_MARKET_DATA = "ONLY market-data WRITES market_data";
const READS_THROUGH = "trading READS market_data ONLY THROUGH market_data.prices_v1";
const WRITES_TRADING = "ONLY trading WRITES trading.orders AND trading.ledger";

const GOOD: Record<string, string> = {
  "architecture/adl/structure.adl": ADL,
  "packages/db-market-data/migrations/0001.sql": `-- the schema and the one view trading may read
CREATE TABLE IF NOT EXISTS market_data.quotes (symbol text);
CREATE OR REPLACE VIEW market_data.prices_v1 AS SELECT symbol FROM market_data.quotes;
GRANT USAGE ON SCHEMA market_data TO trading_owner;
GRANT SELECT ON market_data.prices_v1 TO trading_owner;
`,
  "packages/db-market-data/src/ingest.ts": 'export const insert = "INSERT INTO market_data.quotes (symbol) VALUES ($1)";\n',
  "packages/db-trading/migrations/0001.sql": `CREATE TABLE IF NOT EXISTS trading.orders (order_id uuid);
CREATE TABLE IF NOT EXISTS trading.ledger (entry_id bigint);
GRANT SELECT ON trading.ledger TO market_data_owner;
`,
  "packages/db-trading/src/buy.ts": 'export const price = "SELECT price FROM market_data.prices_v1 WHERE symbol = $1";\nexport const order = "INSERT INTO trading.orders (order_id) VALUES ($1)";\n',
  "apps/web/app/page.ts": "export const x = 1;\n",
};

function repoWith(changes: Record<string, string> = {}): string {
  const root = mkdtempSync(join(tmpdir(), "fitness-data-ownership-"));
  for (const [path, content] of Object.entries({ ...GOOD, ...changes })) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

const firstFailure = (changes: Record<string, string>) => checkDataOwnership(repoWith(changes))[0]!;

describe("the three ownership ASSERTs are recognised by their shape", () => {
  const header = "DESCRIPTION d\nCATEGORY c\nDEFINE SYSTEM S AS s\n  DEFINE LIBRARY market-data AS packages/m\n  DEFINE LIBRARY trading AS packages/t\n\n# Data\n";
  it("parses each form with its parts", () => {
    const rules = parseAdlDocument(`${header}ASSERT(${WRITES_MARKET_DATA})\nASSERT(${READS_THROUGH})\nASSERT(${WRITES_TRADING})`).rules;
    expect(rules.map((r) => r.form)).toEqual([
      { form: "owner-writes", owner: "market-data", objects: ["market_data"] },
      { form: "reads-through", reader: "trading", schema: "market_data", through: "market_data.prices_v1" },
      { form: "owner-writes", owner: "trading", objects: ["trading.orders", "trading.ledger"] },
    ]);
  });

  it("rejects an owner that is not DEFINEd", () => {
    expect(() => parseAdlDocument(`${header}ASSERT(ONLY ghost WRITES market_data)`)).toThrow(/"ghost" is not a DEFINEd/);
  });
});

describe("data ownership: a repo that keeps to the rules", () => {
  it("passes", () => {
    expect(checkDataOwnership(repoWith())).toEqual([]);
  });

  it("passes the real repo", () => {
    expect(checkDataOwnership(realRepoRoot)).toEqual([]);
  });
});

describe(`data ownership: ${WRITES_MARKET_DATA}`, () => {
  it("fails a write to market_data from another directory, naming the file, the line and the owner", () => {
    const violation = firstFailure({ "apps/web/app/page.ts": 'const a = 1;\nexport const x = "INSERT INTO market_data.quotes (symbol) VALUES (1)";\n' });
    expect(violation.rule).toBe(WRITES_MARKET_DATA);
    expect(violation.where).toBe("apps/web/app/page.ts:2");
    expect(violation.why).toContain("only market-data (packages/db-market-data) may write");
  });

  it("fails a grant of a write on a market_data table to another role", () => {
    const violation = firstFailure({ "packages/db-market-data/migrations/0002.sql": "GRANT INSERT ON market_data.quotes TO trading_owner;\n" });
    expect(violation.rule).toBe(WRITES_MARKET_DATA);
    expect(violation.why).toContain("only market_data_owner (market-data) may write it");
    expect(violation.where).toBe("packages/db-market-data/migrations/0002.sql:1");
  });

  it("fails in the shared format, citing the ADL line", () => {
    const text = expectFailureFormat(firstFailure({ "apps/web/app/page.ts": 'export const x = "DELETE FROM market_data.quotes";\n' }), "data ownership");
    expect(text).toMatch(/\(structure\.adl:\d+\)\.$/m);
  });
});

describe(`data ownership: ${READS_THROUGH}`, () => {
  it("fails a read of a market_data table from trading's code", () => {
    const violation = firstFailure({ "packages/db-trading/src/buy.ts": 'export const q = "SELECT * FROM market_data.quotes";\n' });
    expect(violation.rule).toBe(READS_THROUGH);
    expect(violation.where).toBe("packages/db-trading/src/buy.ts:1");
    expect(violation.why).toContain("only through market_data.prices_v1");
  });

  it("fails a grant to trading_owner on a market_data table, which is a grant outside the view", () => {
    const violation = firstFailure({ "packages/db-market-data/migrations/0002.sql": "GRANT SELECT ON market_data.quotes TO trading_owner;\n" });
    expect(violation.rule).toBe(READS_THROUGH);
    expect(violation.why).toContain("grants trading_owner access to market_data.quotes");
  });

  it("fails a grant of every table in the schema", () => {
    const violation = firstFailure({ "packages/db-market-data/migrations/0002.sql": "GRANT SELECT ON ALL TABLES IN SCHEMA market_data TO trading_owner;\n" });
    expect(violation.rule).toBe(READS_THROUGH);
  });
});

describe(`data ownership: ${WRITES_TRADING}`, () => {
  it("fails a write to trading.orders from another owner's code", () => {
    const violation = firstFailure({ "packages/db-market-data/src/oops.ts": 'export const q = "UPDATE trading.orders SET status = 1";\n' });
    expect(violation.rule).toBe(WRITES_TRADING);
    expect(violation.where).toBe("packages/db-market-data/src/oops.ts:1");
    expect(violation.why).toContain("only trading (packages/db-trading) may write");
  });

  it("fails a write grant on trading.ledger to market_data_owner, but allows its read grant", () => {
    const violation = firstFailure({ "packages/db-trading/migrations/0002.sql": "GRANT INSERT, UPDATE ON trading.ledger TO market_data_owner;\n" });
    expect(violation.rule).toBe(WRITES_TRADING);
    expect(violation.why).toContain("only trading_owner (trading) may write it");
  });
});

describe(`data ownership: ${MIGRATION_FOLDER_RULE}`, () => {
  it("fails a trading migration that touches market_data", () => {
    const violations = checkDataOwnership(repoWith({ "packages/db-trading/migrations/0002.sql": "ALTER TABLE market_data.quotes ADD COLUMN x int;\n" }));
    expect(violations.map((v) => v.rule)).toEqual([WRITES_MARKET_DATA, READS_THROUGH, MIGRATION_FOLDER_RULE]);
    const violation = violations.find((v) => v.rule === MIGRATION_FOLDER_RULE)!;
    expect(violation.where).toBe("packages/db-trading/migrations/0002.sql:1");
    expect(violation.why).toContain("touches market_data.quotes, which belongs to another owner");
  });

  it("fails a market_data migration that touches trading", () => {
    const violation = checkDataOwnership(repoWith({ "packages/db-market-data/migrations/0002.sql": "SELECT * FROM trading.accounts;\n" })).find((v) => v.rule === MIGRATION_FOLDER_RULE);
    expect(violation!.where).toBe("packages/db-market-data/migrations/0002.sql:1");
  });

  it("lets a trading migration name the one view it may read", () => {
    expect(checkDataOwnership(repoWith({ "packages/db-trading/migrations/0002.sql": "CREATE VIEW trading.v AS SELECT * FROM market_data.prices_v1;\n" }))).toEqual([]);
  });

  it("fails in the shared format, citing the ADR", () => {
    const text = expectFailureFormat(checkDataOwnership(repoWith({ "packages/db-trading/migrations/0002.sql": "SELECT 1 FROM market_data.quotes;\n" })).find((v) => v.rule === MIGRATION_FOLDER_RULE)!, "data ownership");
    expect(text).toMatch(/\(ADR-0012\)\.$/m);
  });
});
