import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { startServer, signIn, ROOT } from "./helpers.js";

let srv, cookie;
const opts = {};

before(async () => {
  srv = await startServer();
  cookie = (await signIn(srv.base)).cookie;
});
after(async () => { if (srv) await srv.stop(); });

const call = (p, init = {}) =>
  fetch(srv.base + p, { redirect: "manual", ...init, headers: { cookie, "Content-Type": "application/json", ...(init.headers || {}) } });

test("signed-out: page redirects to /login, API returns 401", opts, async () => {
  const page = await fetch(srv.base + "/", { redirect: "manual" });
  assert.equal(page.status, 302);
  assert.equal(page.headers.get("location"), "/login");
  assert.equal((await fetch(srv.base + "/api/projects")).status, 401);
  assert.equal((await fetch(srv.base + "/api/projects/x", { method: "PUT", body: "{}" })).status, 401);
});

test("login rejects a wrong password and a missing name", opts, async () => {
  const bad = await signIn(srv.base, "Rep", "rep@pci.com", "wrong");
  assert.equal(bad.location, "/login?error=password");
  assert.equal(bad.cookie, "");
  const noName = await signIn(srv.base, "", "rep@pci.com");
  assert.equal(noName.location, "/login?error=identity");
});

test("signed-in: toolkit page and /api/me", opts, async () => {
  const page = await call("/");
  assert.equal(page.status, 200);
  assert.match(await page.text(), /NGU Type-X Sales Toolkit/);
  assert.deepEqual(await (await call("/api/me")).json(), { name: "Test Rep", email: "rep@pcigases.com" });
});

test("health check and public brand assets", opts, async () => {
  assert.equal((await fetch(srv.base + "/healthz")).status, 200);
  assert.equal((await fetch(srv.base + "/pci-brand/pci-brand.css")).status, 200);
  assert.equal((await fetch(srv.base + "/login")).status, 200);
});

test("stock projects are seeded once, and a deleted one stays deleted", opts, async () => {
  let list = (await (await call("/api/projects")).json()).projects;
  assert.deepEqual(list.map((p) => p.name).sort(), ["AGI Grain", "Katrium Chemical"]);
  const kat = list.find((p) => p.name === "Katrium Chemical");
  assert.deepEqual({ f: kat.s.inFlow, p: kat.s.inPurity, psi: kat.s.inPsi }, { f: "235", p: "99", psi: "175" });

  assert.equal((await call("/api/projects/seed-agi", { method: "DELETE" })).status, 200);
  assert.equal(await srv.db.seed(path.join(ROOT, "seed", "projects.json")), 0);
  list = (await (await call("/api/projects")).json()).projects;
  assert.deepEqual(list.map((p) => p.name), ["Katrium Chemical"]);
});

test("save, update, list and delete a project", opts, async () => {
  const s = { inFlow: "120", inPurity: "98", inPsi: "135", inAir: "pci", inGp: "30", iLin: "90000", iKwh: "0.08", iHrs: "168", iCap: "", capTouched: false };
  const put = await call("/api/projects/p1", { method: "PUT", body: JSON.stringify({ name: "Acme Foods", at: 1000, v: "1.7", s }) });
  assert.equal(put.status, 200);
  assert.equal((await put.json()).project.rep, "Test Rep");

  const upd = await call("/api/projects/p1", { method: "PUT", body: JSON.stringify({ name: "Acme Foods", at: 2000, v: "1.7", s: { ...s, inFlow: "150" } }) });
  assert.equal(upd.status, 200);
  const got = (await (await call("/api/projects")).json()).projects.find((p) => p.id === "p1");
  assert.equal(got.s.inFlow, "150");
  assert.equal(got.at, 2000);

  assert.equal((await call("/api/projects/p1", { method: "DELETE" })).status, 200);
  assert.equal((await call("/api/projects/p1", { method: "DELETE" })).status, 404);
});

test("a second project with the same name (any case) is refused", opts, async () => {
  const s = { inFlow: "100", inPurity: "97", inPsi: "135" };
  assert.equal((await call("/api/projects/a1", { method: "PUT", body: JSON.stringify({ name: "Dup Co", at: 1, s }) })).status, 200);
  const r = await call("/api/projects/a2", { method: "PUT", body: JSON.stringify({ name: "dup co", at: 2, s }) });
  assert.equal(r.status, 409);
});

test("bad project payloads are refused", opts, async () => {
  assert.equal((await call("/api/projects/ok1", { method: "PUT", body: JSON.stringify({ name: "", s: {} }) })).status, 400);
  assert.equal((await call("/api/projects/ok1", { method: "PUT", body: JSON.stringify({ name: "X" }) })).status, 400);
  assert.equal((await call("/api/projects/bad%20id!", { method: "PUT", body: JSON.stringify({ name: "X", s: {} }) })).status, 400);
  assert.equal((await call("/api/projects/ok1", { method: "PUT", body: "not json" })).status, 400);
  const evil = encodeURIComponent('x"><img src=x onerror="window.__pwned=1">');
  const s = { inFlow: "100", inPurity: "97", inPsi: "135" };
  const r = await call("/api/projects/" + evil, { method: "PUT", body: JSON.stringify({ name: "Evil", s }) });
  assert.equal(r.status, 400);
  assert.equal((await call("/api/projects/" + "a".repeat(65), { method: "PUT", body: JSON.stringify({ name: "Long", s }) })).status, 400);
});

test("project inputs are checked against what the toolkit offers", async () => {
  const s = { inFlow: "120", inPurity: "98", inPsi: "135", inAir: "pci", inGp: "30", iLin: "90000", iKwh: "0.08", iHrs: "168", iCap: "", capTouched: false };
  const put = (id, body) => call("/api/projects/" + id, { method: "PUT", body: JSON.stringify(body) });

  const bad = await put("v1", { name: "Bad Psi Co", s: { ...s, inPsi: "150" } });
  assert.equal(bad.status, 400);
  assert.deepEqual(await bad.json(), { error: "inPsi must be one of 125, 135, 175, 200" });
  assert.equal((await put("v1", { name: "Bad Flow Co", s: { ...s, inFlow: "abc" } })).status, 400);
  assert.equal((await put("v1", { name: "Bad Air Co", s: { ...s, inAir: "<b>" } })).status, 400);
  assert.equal((await put("v1", { name: "No Psi Co", s: { inFlow: "100", inPurity: "97" } })).status, 400);

  const ok = await put("v1", { name: "Legit Co", at: 3000, v: "1.7", s });
  assert.equal(ok.status, 200);
  assert.deepEqual((await ok.json()).project.s, s);
  const names = (await (await call("/api/projects")).json()).projects.map((p) => p.name);
  assert.ok(names.includes("Legit Co") && !names.some((n) => /^Bad|^No Psi/.test(n)));
  assert.equal((await call("/api/projects/v1", { method: "DELETE" })).status, 200);
});

test("sizing events are logged with the rep and export as CSV", opts, async () => {
  const ev = { project: "Acme", flow: 200, purity: 97, psi: 135, airBy: "pci", type: 7, air: 584, compKw: 160, price: 140000, outcome: "sized" };
  assert.equal((await call("/api/sizing", { method: "POST", body: JSON.stringify(ev) })).status, 200);
  assert.equal((await call("/api/sizing", { method: "POST", body: JSON.stringify({ flow: 1 }) })).status, 400);
  const csv = await (await call("/api/sizing.csv")).text();
  const [head, line] = csv.split("\n");
  assert.match(head, /^at,rep,rep_email,project,flow_scfm/);
  assert.match(line, /,Test Rep,rep@pcigases.com,Acme,200,97,135,pci,7,584,160,140000,sized$/);
});
