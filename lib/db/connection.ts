/**
 * The app's one read-only connection to data/circa.db.
 * Kept on globalThis so dev-server hot reloads reuse it instead of opening another.
 * While it is open, `npm run etl:load` cannot replace the file on Windows: stop the server first.
 */
import Database from "better-sqlite3";
import { DB_PATH } from "./schema.ts";

const holder = globalThis as unknown as { circaDb?: Database.Database };

export function getDb(): Database.Database {
  if (!holder.circaDb) {
    try {
      holder.circaDb = new Database(DB_PATH, { readonly: true, fileMustExist: true });
    } catch (err) {
      throw new Error(`Cannot open ${DB_PATH}. Build it with npm run etl:load. (${(err as Error).message})`);
    }
  }
  return holder.circaDb;
}
