// Local demo/dev store. Persists to .data/northline.json. NOT for production use.
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { matches, type NewRecord, type Repo } from "./repo";
import { TABLE_NAMES, type TableName, type Tables } from "./records";

type Dump = { tables: { [K in TableName]: Tables[K][] }; seq: Record<string, number>; seeded: boolean };
const empty = (): Dump => ({ tables: Object.fromEntries(TABLE_NAMES.map((t) => [t, []])) as unknown as Dump["tables"], seq: {}, seeded: false });

export class FileRepo implements Repo {
  readonly driver = "file" as const;
  private dump: Dump;
  constructor(private file: string | null = path.join(process.cwd(), ".data", "northline.json")) {
    this.dump = empty();
    if (file && fs.existsSync(file)) {
      try {
        const d = JSON.parse(fs.readFileSync(file, "utf8")) as Dump;
        this.dump = { ...empty(), ...d, tables: { ...empty().tables, ...d.tables } };
      } catch { /* corrupt file: start clean rather than crash the operator UI */ }
    }
  }
  get seeded() { return this.dump.seeded; }
  markSeeded() { this.dump.seeded = true; this.flush(); }
  private flush() {
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.dump, null, 1));
  }
  async list<T extends TableName>(t: T, filter?: Partial<Tables[T]>) {
    return (this.dump.tables[t] as Tables[T][]).filter((r) => matches(r, filter)).map((r) => structuredClone(r));
  }
  async get<T extends TableName>(t: T, id: string) {
    const r = (this.dump.tables[t] as Tables[T][]).find((x) => x.id === id);
    return r ? structuredClone(r) : null;
  }
  async insert<T extends TableName>(t: T, rec: NewRecord<T>) {
    const now = new Date().toISOString();
    const row = { origin: "live", ...rec, id: randomUUID(), createdAt: now, updatedAt: now } as unknown as Tables[T];
    (this.dump.tables[t] as Tables[T][]).push(row);
    this.flush();
    return structuredClone(row);
  }
  async update<T extends TableName>(t: T, id: string, patch: Partial<Tables[T]>) {
    const rows = this.dump.tables[t] as Tables[T][];
    const i = rows.findIndex((x) => x.id === id);
    if (i < 0) throw new Error(`${t}/${id} not found`);
    rows[i] = { ...rows[i], ...patch, id, updatedAt: new Date().toISOString() };
    this.flush();
    return structuredClone(rows[i]);
  }
  async nextProductionSeq(code: string, year: number) {
    const k = `${code}-${year}`;
    this.dump.seq[k] = (this.dump.seq[k] ?? 0) + 1;
    this.flush();
    return this.dump.seq[k];
  }
}
