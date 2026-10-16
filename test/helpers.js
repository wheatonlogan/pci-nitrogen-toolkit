import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { createDb } from "../src/db.js";
import { createApp } from "../src/app.js";
import { createMemoryDb } from "./memdb.js";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DB_URL = process.env.TEST_DATABASE_URL || "";
export const PASSWORD = "test-team-password";

/**
 * Fresh schema + seed + a server on a random port. With TEST_DATABASE_URL set this
 * runs against that Postgres; without it, against the in-memory stand-in (test/memdb.js).
 */
export async function startServer() {
  process.env.SITE_PASSWORD = PASSWORD;
  process.env.SESSION_SECRET = "test-secret";
  let db;
  if (DB_URL) {
    db = createDb(DB_URL);
    await db.pool.query("DROP TABLE IF EXISTS ngu_projects, ngu_sizing_events, ngu_meta");
  } else {
    db = createMemoryDb();
  }
  await db.migrate();
  await db.seed(path.join(ROOT, "seed", "projects.json"));
  const app = createApp(db);
  const server = await new Promise((resolve) => {
    const s = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" }, () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    db,
    base,
    async stop() {
      await new Promise((r) => server.close(r));
      await db.end();
    },
  };
}

/** Sign in with fetch and return the session cookie. */
export async function signIn(base, name = "Test Rep", email = "rep@pcigases.com", password = PASSWORD) {
  const r = await fetch(`${base}/login`, {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ name, email, password }),
  });
  const set = r.headers.get("set-cookie") || "";
  return { status: r.status, location: r.headers.get("location"), cookie: set.split(";")[0] };
}

export const DB_KIND = DB_URL ? "postgres" : "memory";
