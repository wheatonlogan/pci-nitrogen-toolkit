import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { createDb } from "./db.js";
import { createApp } from "./app.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

if (process.env.RAILWAY_ENVIRONMENT && !process.env.SITE_PASSWORD) {
  console.warn("SITE_PASSWORD is not set: nobody will be able to sign in.");
}

const db = createDb();
await db.migrate();
const seeded = await db.seed(path.join(ROOT, "seed", "projects.json"));
if (seeded) console.log(`Seeded ${seeded} stock projects.`);

const port = Number(process.env.PORT) || 8080;
serve({ fetch: createApp(db).fetch, port, hostname: process.env.HOST || "0.0.0.0" }, () =>
  console.log(`NGU Type-X toolkit listening on :${port}`),
);
