import { Store, type SessionData } from "express-session";
import { sqlite } from "../models/db";

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    sess TEXT NOT NULL,
    expires INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires);
`);

const selectStmt = sqlite.prepare("SELECT sess, expires FROM sessions WHERE sid = ?");
const upsertStmt = sqlite.prepare(
  "INSERT INTO sessions (sid, sess, expires) VALUES (?, ?, ?) " +
    "ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expires = excluded.expires",
);
const touchStmt = sqlite.prepare("UPDATE sessions SET expires = ? WHERE sid = ?");
const deleteStmt = sqlite.prepare("DELETE FROM sessions WHERE sid = ?");
const pruneStmt = sqlite.prepare("DELETE FROM sessions WHERE expires < ?");
const allStmt = sqlite.prepare("SELECT sid, sess, expires FROM sessions");
const clearStmt = sqlite.prepare("DELETE FROM sessions");

function toExpiryMs(session: SessionData): number {
  if (session.cookie?.expires instanceof Date) {
    return session.cookie.expires.getTime();
  }
  const maxAge = session.cookie?.maxAge;
  if (typeof maxAge === "number" && Number.isFinite(maxAge)) {
    return Date.now() + maxAge;
  }
  return Date.now() + 1000 * 60 * 60 * 8;
}

function deserialize(raw: string): SessionData {
  const data = JSON.parse(raw);
  if (data.cookie?.expires) {
    data.cookie.expires = new Date(data.cookie.expires);
  }
  return data;
}

export class SQLiteSessionStore extends Store {
  get(sid: string, cb: (err: any, session?: SessionData | null) => void): void {
    try {
      const row = selectStmt.get(sid) as { sess: string; expires: number } | undefined;
      if (!row) return cb(null, null);
      if (row.expires < Date.now()) {
        deleteStmt.run(sid);
        return cb(null, null);
      }
      cb(null, deserialize(row.sess));
    } catch (err) {
      cb(err);
    }
  }

  set(sid: string, session: SessionData, cb?: (err?: unknown) => void): void {
    try {
      upsertStmt.run(sid, JSON.stringify(session), toExpiryMs(session));
      cb?.();
    } catch (err) {
      cb?.(err);
    }
  }

  touch(sid: string, session: SessionData, cb?: (err?: unknown) => void): void {
    try {
      const row = selectStmt.get(sid) as { expires: number } | undefined;
      if (!row) return cb?.();
      touchStmt.run(toExpiryMs(session), sid);
      cb?.();
    } catch (err) {
      cb?.(err);
    }
  }

  destroy(sid: string, cb?: (err?: unknown) => void): void {
    try {
      deleteStmt.run(sid);
      cb?.();
    } catch (err) {
      cb?.(err);
    }
  }

  length(cb: (err: any, length?: number) => void): void {
    try {
      const row = sqlite.prepare("SELECT COUNT(*) AS n FROM sessions").get() as { n: number };
      cb(null, row.n);
    } catch (err) {
      cb(err);
    }
  }

  clear(cb?: (err?: unknown) => void): void {
    try {
      clearStmt.run();
      cb?.();
    } catch (err) {
      cb?.(err);
    }
  }

  all(cb: (err: unknown, obj?: Record<string, SessionData> | null) => void): void {
    try {
      const rows = allStmt.all() as { sid: string; sess: string; expires: number }[];
      const out: Record<string, SessionData> = {};
      for (const row of rows) {
        if (row.expires >= Date.now()) out[row.sid] = deserialize(row.sess);
      }
      cb(null, out);
    } catch (err) {
      cb(err);
    }
  }
}

const pruneTimer = setInterval(() => {
  try {
    pruneStmt.run(Date.now());
  } catch {
    // ignore prune failures; they are retried on the next interval
  }
}, 1000 * 60 * 60);
pruneTimer.unref();
