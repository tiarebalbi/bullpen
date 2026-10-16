import type { ReactNode } from "react";
import { ErrorState } from "@bullpen/ui";

/** What a read of the database that failed looks like: a 503 from a route that reads it says the database did not answer. */
export const DATABASE_UNAVAILABLE = 503;

export function Unavailable({ httpStatus, title, message, what }: { httpStatus: number | null; title: string; message: string; what: string }): ReactNode {
  if (httpStatus === DATABASE_UNAVAILABLE) {
    return <ErrorState title="Database unavailable" description={`${what} are read from the database, and it did not answer. The live Bitcoin price does not use it. This page tries again by itself.`} />;
  }
  return <ErrorState title={title} description={message} />;
}
