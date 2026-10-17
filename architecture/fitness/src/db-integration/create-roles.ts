import { randomBytes } from "node:crypto";
import type { Client } from "pg";

export const OWNER_ROLES = ["market_data_owner", "trading_owner"] as const;
export type OwnerRole = (typeof OWNER_ROLES)[number];

/**
 * Creates the two owner roles as plain roles: login only, no superuser, no
 * CREATEDB, no CREATEROLE, no BYPASSRLS. A role made in some providers'
 * consoles joins a superuser-like role that reads and writes every schema,
 * and the admin role cannot take that back, so the roles are made here with
 * SQL instead. The creator gets ADMIN on a role it creates, which is what
 * lets it grant the role to itself and run that owner's migrations.
 *
 * A role that already exists is left alone, unless it can read every schema,
 * which is an error that says how to fix it. Passwords are returned only for
 * roles created now, and are never logged.
 */
export async function createOwnerRoles(admin: Client): Promise<Partial<Record<OwnerRole, string>>> {
  const created: Partial<Record<OwnerRole, string>> = {};
  for (const role of OWNER_ROLES) {
    const existing = await admin.query<{ privileged: boolean }>(
      `SELECT (rolsuper OR rolbypassrls
               OR pg_has_role(rolname, 'pg_read_all_data', 'USAGE')
               OR pg_has_role(rolname, 'pg_write_all_data', 'USAGE')) AS privileged
         FROM pg_roles WHERE rolname = $1`,
      [role],
    );
    if (existing.rows[0]) {
      if (existing.rows[0].privileged) {
        throw new Error(`role ${role} exists and can read or write every schema (it was probably created in a console). Delete it there, then run this again.`);
      }
      continue;
    }
    const password = randomBytes(24).toString("hex");
    await admin.query(`CREATE ROLE ${role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '${password}'`);
    created[role] = password;
  }
  return created;
}
