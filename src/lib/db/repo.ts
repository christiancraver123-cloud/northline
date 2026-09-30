// Persistence boundary. All application code talks to `Repo`; the driver is chosen by NORTHLINE_STORE.
// "file"     -> local JSON store in .data/ (DEMO/dev; clearly not production persistence)
// "supabase" -> Postgres via supabase-js (production source of truth)
import type { TableName, Tables } from "./records";

export type NewRecord<T extends TableName> = Omit<Tables[T], "id" | "createdAt" | "updatedAt" | "origin"> &
  Partial<Pick<Tables[T], "origin">>;

export interface Repo {
  readonly driver: "file" | "supabase";
  list<T extends TableName>(t: T, filter?: Partial<Tables[T]>): Promise<Tables[T][]>;
  get<T extends TableName>(t: T, id: string): Promise<Tables[T] | null>;
  insert<T extends TableName>(t: T, rec: NewRecord<T>): Promise<Tables[T]>;
  update<T extends TableName>(t: T, id: string, patch: Partial<Tables[T]>): Promise<Tables[T]>;
  /** Atomically reserve the next production sequence number for a creator+year. */
  nextProductionSeq(talentCode: string, year: number): Promise<number>;
}

export function matches<R extends object>(rec: R, filter?: Partial<R>): boolean {
  if (!filter) return true;
  return Object.entries(filter).every(([k, v]) => v === undefined || (rec as Record<string, unknown>)[k] === v);
}
