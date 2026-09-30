import { createHash } from "node:crypto";

/**
 * The identity every commit in this repo must carry (ADR-0009).
 *
 * The repo is public and file contents get harvested, so the author's email
 * address is deliberately written in no file. Only its SHA-256 fingerprint is
 * here, which is enough for CI to recognise the address without publishing
 * it. The `email-in-files` check fails if the address itself ever lands in a
 * tracked file.
 */
export interface RepoIdentity {
  name: string;
  /** SHA-256 of the trimmed, lower-cased email address. */
  emailSha256: string;
}

export const REPO_IDENTITY: RepoIdentity = {
  name: "Tiare Balbi Bonamini",
  emailSha256: "528a24d7d772cadcbebd55ce86640d7972d6fe50afa97b6731a2aed45b12b289",
};

/** SHA-256 fingerprint of an email address, case- and whitespace-insensitive. */
export function emailFingerprint(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

/** An identity built from a plain name and email, for tests and fixtures. */
export function identityFor(name: string, email: string): RepoIdentity {
  return { name, emailSha256: emailFingerprint(email) };
}
