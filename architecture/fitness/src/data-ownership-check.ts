import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { loadAdlDocument, findAdlFile, type AdlDocument, type AdlRule } from "./adl.js";
import { citeAdl } from "./rules.js";
import { lineAt, scanFiles } from "./source-scan.js";
import { toRepoPath, type Violation } from "./violation.js";

const CHECK = "data ownership";

/** Recorded in ADR-0012 (the ADL has no line for it: it is about where a migration may reach). */
export const MIGRATION_FOLDER_RULE = "a migration in one owner's folder touches only that owner's schema";

type WriteRule = AdlRule & { form: { form: "owner-writes"; owner: string; objects: string[] } };
type ReadRule = AdlRule & { form: { form: "reads-through"; reader: string; schema: string; through: string } };

interface SqlFile {
  path: string;
  /** Comments blanked, newlines kept. */
  code: string;
}

const SKIPPED = new Set(["node_modules", ".next", ".turbo", "dist", "coverage", ".git", "__fixtures__"]);

function listSql(repoRoot: string): SqlFile[] {
  const files: SqlFile[] = [];
  const walk = (directory: string): void => {
    if (!existsSync(directory)) return;
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name);
      if (statSync(path).isDirectory()) {
        if (!SKIPPED.has(name)) walk(path);
      } else if (name.endsWith(".sql")) {
        files.push({ path: toRepoPath(repoRoot, path), code: readFileSync(path, "utf8").replace(/--[^\n]*/g, (comment) => " ".repeat(comment.length)) });
      }
    }
  };
  for (const root of ["apps", "packages"]) walk(join(repoRoot, root));
  return files;
}

const schemaOf = (object: string): string => object.split(".")[0]!;
const isSchemaOnly = (object: string): boolean => !object.includes(".");
const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const ownerRole = (schema: string): string => `${schema}_owner`;

/** The directory of the DEFINEd entry called `name`. */
function pathOf(adl: AdlDocument, name: string): string | undefined {
  return adl.entries.find((entry) => entry.name === name)?.path;
}

const WRITE_VERBS = "INSERT\\s+INTO|UPDATE|DELETE\\s+FROM|TRUNCATE(?:\\s+TABLE)?|ALTER\\s+TABLE(?:\\s+IF\\s+EXISTS)?|DROP\\s+TABLE(?:\\s+IF\\s+EXISTS)?|CREATE\\s+TABLE(?:\\s+IF\\s+NOT\\s+EXISTS)?";

/** A statement that writes `object` (a schema, or `schema.table`). */
function writePattern(object: string): RegExp {
  const target = isSchemaOnly(object) ? `${escape(object)}\\.\\w+` : `${escape(object)}(?![\\w.])`;
  return new RegExp(`\\b(?:${WRITE_VERBS})\\s+(?:ONLY\\s+)?${target}`, "gi");
}

interface Grant {
  index: number;
  privileges: string;
  objects: string[];
  grantees: string[];
}

function grantsIn(code: string): Grant[] {
  const grants: Grant[] = [];
  for (const match of code.matchAll(/\bGRANT\s+([^;]+?)\s+ON\s+(?:ALL\s+TABLES\s+IN\s+SCHEMA\s+|TABLE\s+|SCHEMA\s+)?([\w.]+(?:\s*,\s*[\w.]+)*)\s+TO\s+([^;]+?)\s*;/gi)) {
    const [, privileges, objects, grantees] = match as unknown as [string, string, string, string];
    grants.push({
      index: match.index,
      privileges,
      objects: objects.split(",").map((o) => o.trim()),
      grantees: grantees.split(",").map((g) => g.trim().replace(/\s+WITH\s+GRANT\s+OPTION$/i, "")),
    });
  }
  return grants;
}

const grantsWrite = (privileges: string): boolean => /\b(INSERT|UPDATE|DELETE|TRUNCATE|ALL)\b/i.test(privileges);
const covers = (object: string, granted: string): boolean => granted === object || (isSchemaOnly(object) && granted.startsWith(`${object}.`)) || (isSchemaOnly(granted) && granted === schemaOf(object));

function writeViolations(repoRoot: string, adl: AdlDocument, rule: WriteRule, sql: SqlFile[]): Violation[] {
  const ownerDir = pathOf(adl, rule.form.owner);
  if (!ownerDir) return [];
  const owner = rule.form.owner;
  const cite = citeAdl(repoRoot, rule.text);
  const violations: Violation[] = [];

  const sources = [...sql, ...scanFiles(repoRoot, ["apps", "packages"]).map((file) => ({ path: file.path, code: file.code }))];
  for (const object of rule.form.objects) {
    const role = ownerRole(schemaOf(object));
    for (const file of sources) {
      if (file.path.startsWith(`${ownerDir}/`)) continue;
      const first = writePattern(object).exec(file.code);
      if (!first) continue;
      violations.push({
        check: CHECK,
        rule: rule.text,
        where: `${file.path}:${lineAt(file.code, first.index)}`,
        why: `${file.path} writes ${object}, which only ${owner} (${ownerDir}) may write (${cite}).`,
        fix: `Move the write into ${ownerDir}, or ask ${owner} to expose it.`,
      });
    }
    for (const file of sql) {
      for (const grant of grantsIn(file.code)) {
        const wrong = grant.grantees.filter((grantee) => grantee.toLowerCase() !== role);
        if (!grantsWrite(grant.privileges) || wrong.length === 0 || !grant.objects.some((granted) => covers(object, granted))) continue;
        violations.push({
          check: CHECK,
          rule: rule.text,
          where: `${file.path}:${lineAt(file.code, grant.index)}`,
          why: `${file.path} grants a write on ${object} to ${wrong.join(", ")}, but only ${role} (${owner}) may write it (${cite}).`,
          fix: `Remove the grant to ${wrong.join(", ")}; only ${role} writes ${object}.`,
        });
      }
    }
  }
  return violations;
}

function readViolations(repoRoot: string, adl: AdlDocument, rule: ReadRule, writeRules: WriteRule[], sql: SqlFile[]): Violation[] {
  const readerDir = pathOf(adl, rule.form.reader);
  if (!readerDir) return [];
  const { schema, through, reader } = rule.form;
  const cite = citeAdl(repoRoot, rule.text);
  const readerSchema = schemaOf(writeRules.find((w) => w.form.owner === reader)?.form.objects[0] ?? reader.replace(/-/g, "_"));
  const role = ownerRole(readerSchema);
  const violations: Violation[] = [];

  const reference = new RegExp(`(?<![\\w.])${escape(schema)}\\.(\\w+)`, "g");
  const readerFiles = [...sql, ...scanFiles(repoRoot, ["apps", "packages"]).map((file) => ({ path: file.path, code: file.code }))].filter((file) => file.path.startsWith(`${readerDir}/`));
  for (const file of readerFiles) {
    for (const match of file.code.matchAll(reference)) {
      if (`${schema}.${match[1]}` === through) continue;
      violations.push({
        check: CHECK,
        rule: rule.text,
        where: `${file.path}:${lineAt(file.code, match.index)}`,
        why: `${file.path} reads ${schema}.${match[1]}, but ${reader} may read ${schema} only through ${through} (${cite}).`,
        fix: `Read ${through} instead of ${schema}.${match[1]}.`,
      });
    }
  }

  for (const file of sql) {
    for (const grant of grantsIn(file.code)) {
      if (!grant.grantees.some((grantee) => grantee.toLowerCase() === role)) continue;
      const bad = grant.objects.filter((object) => schemaOf(object) === schema && object !== through && !(isSchemaOnly(object) && /^USAGE$/i.test(grant.privileges.trim())));
      if (bad.length === 0) continue;
      violations.push({
        check: CHECK,
        rule: rule.text,
        where: `${file.path}:${lineAt(file.code, grant.index)}`,
        why: `${file.path} grants ${role} access to ${bad.join(", ")}, but ${reader} may read ${schema} only through ${through} (${cite}).`,
        fix: `Grant ${role} only USAGE on schema ${schema} and SELECT on ${through}.`,
      });
    }
  }
  return violations;
}

/** Each owner's migration folder reaches only that owner's schema (plus the one view it may read). */
function migrationViolations(repoRoot: string, adl: AdlDocument, writeRules: WriteRule[], readRules: ReadRule[], sql: SqlFile[]): Violation[] {
  const schemas = [...new Set(writeRules.flatMap((rule) => rule.form.objects.map(schemaOf)))];
  const violations: Violation[] = [];
  for (const rule of writeRules) {
    const dir = pathOf(adl, rule.form.owner);
    if (!dir) continue;
    const own = new Set(rule.form.objects.map(schemaOf));
    const viewsAllowed = readRules.filter((read) => read.form.reader === rule.form.owner).map((read) => read.form.through);
    for (const file of sql.filter((f) => f.path.startsWith(`${dir}/migrations/`))) {
      for (const other of schemas.filter((schema) => !own.has(schema))) {
        for (const match of file.code.matchAll(new RegExp(`(?<![\\w.])${escape(other)}\\.(\\w+)`, "g"))) {
          if (viewsAllowed.includes(`${other}.${match[1]}`)) continue;
          violations.push({
            check: CHECK,
            rule: MIGRATION_FOLDER_RULE,
            where: `${file.path}:${lineAt(file.code, match.index)}`,
            why: `${file.path} is one of ${rule.form.owner}'s migrations but touches ${other}.${match[1]}, which belongs to another owner (ADR-0012).`,
            fix: `Move the change into the migration folder of the owner of ${other}, or drop it from ${file.path}.`,
          });
        }
      }
    }
  }
  return violations;
}

/**
 * The three data-ownership ASSERTs, and the migration-folder rule, enforced
 * without a database: writes to an owner's schema or tables come only from
 * that owner's directory and are granted only to its role; a reader reaches
 * another schema only through its named view; a migration reaches only its own
 * schema. The database tests prove the same thing against real roles.
 */
export function checkDataOwnership(repoRoot: string): Violation[] {
  if (!findAdlFile(repoRoot)) return [];
  const adl = loadAdlDocument(repoRoot);
  const writeRules = adl.rules.filter((rule): rule is WriteRule => rule.form.form === "owner-writes");
  const readRules = adl.rules.filter((rule): rule is ReadRule => rule.form.form === "reads-through");
  if (writeRules.length === 0 && readRules.length === 0) return [];

  const sql = listSql(repoRoot);
  return [
    ...writeRules.flatMap((rule) => writeViolations(repoRoot, adl, rule, sql)),
    ...readRules.flatMap((rule) => readViolations(repoRoot, adl, rule, writeRules, sql)),
    ...migrationViolations(repoRoot, adl, writeRules, readRules, sql),
  ];
}
