import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, signIn, PASSWORD } from "./helpers.js";
import { csvCell } from "../src/app.js";
import { FREE_FAILURES } from "../src/login-limit.js";

let srv;
before(async () => { srv = await startServer(); });
after(async () => { if (srv) await srv.stop(); });

const login = (password, headers = {}) => fetch(`${srv.base}/login`, {
  method: "POST",
  redirect: "manual",
  headers: { "Content-Type": "application/x-www-form-urlencoded", ...headers },
  body: new URLSearchParams({ name: "Rep", email: "rep@pcigases.com", password }),
});

test("CSV cells that would run as a spreadsheet formula open as text", () => {
  for (const evil of ["=HYPERLINK(\"http://x\",\"y\")", "+cmd|' /C calc'!A0", "-2+3", "@SUM(A1)", "\t=1", "\r=1"]) {
    const cell = csvCell(evil);
    assert.match(cell, /^"?'/, JSON.stringify(evil));
  }
  assert.equal(csvCell("Acme"), "Acme");
  assert.equal(csvCell(-12.5), "-12.5");
  assert.equal(csvCell("a,b"), '"a,b"');
  assert.equal(csvCell('=1,"2"'), `"'=1,""2"""`);
});

test("/api/sizing.csv neutralises formula-looking project and rep names", async () => {
  const set = (await fetch(`${srv.base}/login`, {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "x-real-ip": "198.51.100.1" },
    body: new URLSearchParams({ name: "=Rep", email: "rep@pcigases.com", password: PASSWORD }),
  })).headers.get("set-cookie");
  const cookie = set.split(";")[0];
  const ev = { project: "=HYPERLINK(\"http://x\")", flow: 200, purity: 97, psi: 135, airBy: "pci", type: 7, air: 584, compKw: 160, price: 140000, outcome: "sized" };
  const post = await fetch(`${srv.base}/api/sizing`, {
    method: "POST", headers: { cookie, "Content-Type": "application/json" }, body: JSON.stringify(ev),
  });
  assert.equal(post.status, 200);
  const csv = await (await fetch(`${srv.base}/api/sizing.csv`, { headers: { cookie } })).text();
  const line = csv.split("\n").find((l) => l.includes("HYPERLINK"));
  assert.ok(line.includes(`,'=Rep,rep@pcigases.com,"'=HYPERLINK(""http://x"")",200,`), line);
});

test("repeated wrong passwords lock a client out, even with the right one", async () => {
  const ip = { "x-real-ip": "203.0.113.20" };
  for (let i = 0; i < FREE_FAILURES + 1; i++) {
    assert.equal((await login("wrong", ip)).headers.get("location"), "/login?error=password");
  }
  const locked = await login(PASSWORD, ip);
  assert.equal(locked.headers.get("location"), "/login?error=wait");
  assert.ok(Number(locked.headers.get("retry-after")) >= 1);
  assert.equal(locked.headers.get("set-cookie"), null);
  // another client still signs in
  const other = await login(PASSWORD, { "x-real-ip": "203.0.113.21" });
  assert.equal(other.headers.get("location"), "/");
});

test("rotating a forged X-Real-IP does not escape the lockout", async () => {
  const xff = (i) => ({ "x-real-ip": `10.7.7.${i}`, "x-forwarded-for": "9.9.9.9, 192.0.2.77" });
  for (let i = 0; i < FREE_FAILURES + 1; i++) await login("wrong", xff(i));
  assert.equal((await login(PASSWORD, xff(99))).headers.get("location"), "/login?error=wait");
});

test("a successful sign-in still works for an untouched client", async () => {
  const r = await signIn(srv.base);
  assert.equal(r.location, "/");
  assert.ok(r.cookie.startsWith("ngu_session=v2."));
});
