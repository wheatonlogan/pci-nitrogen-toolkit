import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { checkPassword, identity, startSession, endSession, currentUser, requireUser } from "./auth.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pub = (f) => path.join(ROOT, "public", f);

const STATE_KEYS = ["inFlow", "inPurity", "inPsi", "inAir", "inGp", "iLin", "iKwh", "iHrs", "iCap", "capTouched"];
const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Accepts a toolkit project record and returns a clean copy, or null. */
export function cleanProject(id, body) {
  if (!ID.test(id || "") || !body || typeof body !== "object") return null;
  const name = String(body.name ?? "").trim().slice(0, 60);
  if (!name || !body.s || typeof body.s !== "object") return null;
  const s = {};
  for (const k of STATE_KEYS) {
    if (k === "capTouched") s[k] = !!body.s[k];
    else if (body.s[k] !== undefined) s[k] = String(body.s[k]).slice(0, 20);
  }
  const at = Number(body.at);
  return { id, name, s, v: String(body.v ?? "").slice(0, 10), at: Number.isFinite(at) && at > 0 ? at : Date.now() };
}

const numOrNull = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

export function cleanSizing(b) {
  if (!b || typeof b !== "object") return null;
  const e = {
    project: b.project ? String(b.project).slice(0, 60) : null,
    flow: numOrNull(b.flow),
    purity: numOrNull(b.purity),
    psi: numOrNull(b.psi),
    airBy: b.airBy === "cust" ? "cust" : "pci",
    type: numOrNull(b.type),
    air: numOrNull(b.air),
    compKw: numOrNull(b.compKw),
    price: numOrNull(b.price),
    outcome: ["sized", "saved"].includes(b.outcome) ? b.outcome : "sized",
  };
  return e.flow === null || e.purity === null || e.psi === null ? null : e;
}

const csvCell = (v) => {
  if (v === null || v === undefined) return "";
  const s = v instanceof Date ? v.toISOString() : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function createApp(db) {
  const app = new Hono();

  app.get("/healthz", async (c) => {
    await db.pool.query("select 1");
    return c.json({ ok: true });
  });

  // ---------- sign-in ----------
  app.get("/login", (c) => c.html(fs.readFileSync(pub("login.html"), "utf8")));
  app.post("/login", async (c) => {
    const form = await c.req.parseBody();
    const user = identity(form);
    if (!checkPassword(form.password || "")) return c.redirect("/login?error=password");
    if (!user) return c.redirect("/login?error=identity");
    startSession(c, user);
    return c.redirect("/");
  });
  app.post("/logout", (c) => {
    endSession(c);
    return c.redirect("/login");
  });

  // Brand assets are needed by the sign-in page, so they are public.
  app.use("/pci-brand/*", serveStatic({ root: path.relative(process.cwd(), path.join(ROOT, "public")) }));

  // ---------- the toolkit ----------
  app.get("/", requireUser(), (c) => {
    c.header("Cache-Control", "no-store");
    return c.html(fs.readFileSync(pub("toolkit.html"), "utf8"));
  });

  // ---------- API ----------
  const api = new Hono();
  api.use("*", requireUser());

  api.get("/me", (c) => c.json(c.get("user")));

  api.get("/projects", async (c) => c.json({ projects: await db.listProjects() }));

  api.put("/projects/:id", async (c) => {
    const p = cleanProject(c.req.param("id"), await c.req.json().catch(() => null));
    if (!p) return c.json({ error: "invalid project" }, 400);
    const r = await db.saveProject(p, c.get("user"));
    if (r.conflict) return c.json({ error: "name taken", name: r.conflict }, 409);
    return c.json({ project: r.project });
  });

  api.delete("/projects/:id", async (c) => {
    const ok = await db.deleteProject(c.req.param("id"));
    return ok ? c.json({ ok: true }) : c.json({ error: "not found" }, 404);
  });

  api.post("/sizing", async (c) => {
    const e = cleanSizing(await c.req.json().catch(() => null));
    if (!e) return c.json({ error: "invalid sizing event" }, 400);
    await db.logSizing(e, c.get("user"));
    return c.json({ ok: true });
  });

  // Download of everything sized, for analysis in Excel.
  api.get("/sizing.csv", async (c) => {
    const rows = await db.listSizing(Number(c.req.query("limit")) || 10000);
    const cols = ["at", "rep", "rep_email", "project", "flow_scfm", "purity", "feed_psig", "air_by",
      "ngu_type", "feed_air_scfm", "compressor_kw", "price", "outcome"];
    const body = [cols.join(","), ...rows.map((r) => cols.map((k) => csvCell(r[k])).join(","))].join("\n");
    c.header("Content-Type", "text/csv; charset=utf-8");
    c.header("Content-Disposition", 'attachment; filename="ngu-sizing-log.csv"');
    return c.body(body);
  });

  app.route("/api", api);

  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: "server error" }, 500);
  });

  return app;
}

export { currentUser };
