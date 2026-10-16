// Browser tests: the hosted toolkit in headless Chromium against a real server
// (Postgres when TEST_DATABASE_URL is set, otherwise the in-memory stand-in).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";
import { startServer, PASSWORD, ROOT } from "./helpers.js";

/** A Chromium or Chrome to drive: env override, Playwright's own, then the usual Linux and macOS installs. */
function findChromium() {
  const env = process.env.CHROMIUM_PATH || process.env.CHROME_PATH;
  if (env) return env;
  let bundled = null;
  try { bundled = chromium.executablePath(); } catch {}
  // Any Playwright-downloaded Chromium, newest first, in case it is not the revision playwright-core expects.
  const caches = [process.env.PLAYWRIGHT_BROWSERS_PATH, "/opt/pw-browsers",
    path.join(os.homedir(), "Library", "Caches", "ms-playwright"), path.join(os.homedir(), ".cache", "ms-playwright")];
  const cached = caches.filter((d) => d && fs.existsSync(d)).flatMap((d) =>
    fs.readdirSync(d).filter((n) => /^chromium-\d+$/.test(n))
      .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]))
      .flatMap((n) => [
        path.join(d, n, "chrome-linux", "chrome"),
        path.join(d, n, "chrome-mac-arm64", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"),
        path.join(d, n, "chrome-mac", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"),
        path.join(d, n, "chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium"),
      ]));
  return [bundled, ...cached, "/usr/bin/chromium", "/usr/bin/google-chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find((p) => p && fs.existsSync(p));
}
const EXE = findChromium();
const skip = !EXE && "set CHROMIUM_PATH (or CHROME_PATH) to a Chromium or Chrome binary to run";
const opts = { skip };

let srv, browser;
before(async () => {
  if (skip) return;
  srv = await startServer();
  browser = await chromium.launch({ executablePath: EXE });
});
after(async () => {
  if (browser) await browser.close();
  if (srv) await srv.stop();
});

async function rep(name, email) {
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => { window.__nguLogDelay = 300; });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(srv.base + "/");
  assert.match(page.url(), /\/login$/);
  await page.fill("input[name=name]", name);
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", PASSWORD);
  await Promise.all([page.waitForURL(srv.base + "/"), page.click("button[type=submit]")]);
  await page.waitForFunction(() => document.getElementById("nguWho").textContent.length > 0);
  return { ctx, page, errors };
}

const size = async (page, { flow, purity, psi, air = "pci" }) => {
  await page.selectOption("#inPurity", String(purity));
  await page.selectOption("#inPsi", String(psi));
  await page.selectOption("#inAir", air);
  await page.fill("#inFlow", String(flow));
};
const text = (page, sel) => page.locator(sel).innerText();

test("sign-in shows the rep, and the page loads without errors", opts, async () => {
  const { ctx, page, errors } = await rep("Avery Rep", "avery@pcigases.com");
  assert.equal(await text(page, "#nguWho"), "Avery Rep");
  assert.match(await page.title(), /NGU Type-X/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("model: reproduces the Evonik worked example (100 scfm, 99%, 135 psig)", opts, async () => {
  const { ctx, page } = await rep("Avery Rep", "avery@pcigases.com");
  await size(page, { flow: 100, purity: 99, psi: 135 });
  assert.equal(await text(page, "#oType"), "Type 6");          // Evonik: 6 modules
  assert.equal(await text(page, "#oAir"), "451");              // 100 x 4.51 air factor
  assert.match(await text(page, "#oAirSub"), /4\.51×/);
  assert.match(await text(page, "#oTypeSub"), /803199-006/);
  await ctx.close();
});

test("model: at 135 psig no Type reaches Katrium (235 scfm @ 99%), at 175 psig one does", opts, async () => {
  const { ctx, page } = await rep("Avery Rep", "avery@pcigases.com");
  await size(page, { flow: 235, purity: 99, psi: 135 });
  assert.match(await text(page, "#verdict"), /No single Type reaches this/);
  await size(page, { flow: 235, purity: 99, psi: 175 });
  assert.match(await text(page, "#verdict"), /In range/);
  await ctx.close();
});

test("payback matches a closed-form crossover", opts, async () => {
  const { ctx, page } = await rep("Avery Rep", "avery@pcigases.com");
  await size(page, { flow: 200, purity: 97, psi: 135 });
  await page.click("#tab2");
  const lin = 180000, kwh = 0.08, hrs = 168;
  await page.fill("#iLin", String(lin));
  await page.fill("#iKwh", String(kwh));
  const cap = Number(await page.inputValue("#iCap"));
  const kw = Number((await text(page, "#sKw")).replace(/[^\d.]/g, ""));
  const annual = kw * hrs * 52 * kwh + cap * 0.04;
  const expected = Math.ceil(cap / ((lin - annual) / 12) - 1e-9);
  assert.ok(cap > 0 && kw > 14);
  assert.equal(await text(page, "#sPB"), `${expected} mo`);
  await ctx.close();
});

test("customer-supplied air carries the not-free note on both tabs", opts, async () => {
  const { ctx, page } = await rep("Avery Rep", "avery@pcigases.com");
  await size(page, { flow: 150, purity: 97, psi: 135, air: "cust" });
  assert.match(await text(page, "#verdict"), /Customer's air:.*Tab 2 does not count it/s);
  await page.click("#tab2");
  assert.match(await text(page, "#pbCarryTxt"), /Customer's air is not free/);
  await page.click("#tab1");
  await size(page, { flow: 150, purity: 97, psi: 135, air: "pci" });
  await page.click("#tab2");
  assert.doesNotMatch(await text(page, "#pbCarryTxt"), /not free/);
  await ctx.close();
});

test("projects: stock projects listed; a save by one rep opens for another", opts, async () => {
  const a = await rep("Avery Rep", "avery@pcigases.com");
  await a.page.click("#tab3");
  await a.page.waitForSelector(".proj-card");
  const names = await a.page.locator(".proj-card__name").allInnerTexts();
  assert.ok(names.includes("Katrium Chemical") && names.includes("AGI Grain"));

  await a.page.click("#tab1");
  await size(a.page, { flow: 180, purity: 98, psi: 175 });
  await a.page.fill("#projName", "Shared Test Site");
  await a.page.click("#projSave");
  await a.page.waitForFunction(() => document.getElementById("projMsg").textContent.includes("Saved"));
  await a.page.evaluate(() => syncChain);

  const b = await rep("Blake Rep", "blake@pcigases.com");
  await b.page.click("#tab3");
  const card = b.page.locator(".proj-card", { hasText: "Shared Test Site" });
  await card.waitFor();
  assert.match(await card.innerText(), /Avery Rep/);
  await card.locator("[data-load]").click();
  assert.equal(await b.page.inputValue("#inFlow"), "180");
  assert.equal(await b.page.inputValue("#inPsi"), "175");

  // Blake deletes it (two clicks); it is gone for Avery after a reload.
  await b.page.click("#tab3");
  const del = b.page.locator(".proj-card", { hasText: "Shared Test Site" }).locator("[data-del]");
  await del.click();
  await b.page.locator(".proj-card", { hasText: "Shared Test Site" }).locator("[data-del]").click();
  await b.page.evaluate(() => syncChain);
  await a.page.reload();
  await a.page.click("#tab3");
  await a.page.waitForSelector(".proj-card");
  assert.equal(await a.page.locator(".proj-card", { hasText: "Shared Test Site" }).count(), 0);
  await a.ctx.close();
  await b.ctx.close();
});

test("projects: an offline projects file imports into the team list", opts, async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ngu-")), "NGU Projects.json");
  fs.writeFileSync(file, JSON.stringify({
    format: "pci.ngu.projects", version: 1, app: "1.6", exported: new Date().toISOString(),
    projects: [{ id: "poffline1", name: "Offline Import Co", at: Date.now(), v: "1.6",
      s: { inFlow: "90", inPurity: "97", inPsi: "135", inAir: "pci", inGp: "30", iLin: "", iKwh: "", iHrs: "168", iCap: "", capTouched: false } }],
  }));
  const { ctx, page } = await rep("Avery Rep", "avery@pcigases.com");
  await page.click("#tab3");
  await page.waitForSelector(".proj-card");
  await page.setInputFiles("#pfileInput", file);
  await page.locator(".proj-card", { hasText: "Offline Import Co" }).waitFor();
  await page.evaluate(() => syncChain);
  const list = (await srv.db.listProjects()).map((p) => p.name);
  assert.ok(list.includes("Offline Import Co"));
  await ctx.close();
});

test("sizing log: one entry per settled sizing, one per save", opts, async () => {
  await srv.db.pool.query("DELETE FROM ngu_sizing_events");
  const { ctx, page } = await rep("Casey Rep", "casey@pcigases.com");
  await size(page, { flow: 220, purity: 97, psi: 135 });
  await page.waitForTimeout(900);
  await page.fill("#inGp", "25");             // price-only change: not a new sizing
  await page.waitForTimeout(900);
  await page.fill("#projName", "Log Test Co");
  await page.click("#projSave");
  await page.waitForTimeout(500);
  const rows = (await srv.db.listSizing()).reverse();
  assert.deepEqual(rows.map((r) => [r.rep, r.flow_scfm, r.purity, r.feed_psig, r.outcome]),
    [["Casey Rep", 220, 97, 135, "sized"], ["Casey Rep", 220, 97, 135, "saved"]]);
  assert.equal(rows[1].project, "Log Test Co");
  await ctx.close();
});

test("print: a one-page spec sheet with the sizing, payback and rep", opts, async () => {
  const { ctx, page } = await rep("Avery Rep", "avery@pcigases.com");
  await size(page, { flow: 200, purity: 97, psi: 135 });
  await page.fill("#projName", "Print Test Co");
  await page.click("#tab2");
  await page.fill("#iLin", "180000");
  await page.fill("#iKwh", "0.08");
  const pb = await text(page, "#sPB");
  const type = await page.evaluate(() => sized().type);
  const part = await page.evaluate(() => PART[sized().type]);
  await page.emulateMedia({ media: "print" });
  await page.evaluate(() => buildPrintSheet());
  assert.equal(await page.locator("#printSheet").isVisible(), true);
  assert.equal(await page.locator("#panel2").isVisible(), false);
  assert.equal(await page.locator(".proj-bar").isVisible(), false);
  const sheet = await text(page, "#printSheet");
  for (const s of ["NGU Type-X Spec Sheet", "Print Test Co", "Prepared by Avery Rep", `Type ${type}`, part,
    "200 scfm", "97%", "135 psig", pb, "not a quotation", "v1.7"]) {
    assert.ok(sheet.includes(s), `spec sheet is missing "${s}"`);
  }
  const pdf = await page.pdf({ format: "Letter" });
  const pages = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
  assert.equal(pages, 1, "spec sheet should print on one page");
  fs.mkdirSync(path.join(ROOT, "test-results"), { recursive: true });
  fs.writeFileSync(path.join(ROOT, "test-results", "spec-sheet.pdf"), pdf);
  await ctx.close();
});

test("print: unsized inputs print a clear 'not sized' sheet", opts, async () => {
  const { ctx, page } = await rep("Avery Rep", "avery@pcigases.com");
  await size(page, { flow: 600, purity: 97, psi: 135 });
  await page.evaluate(() => buildPrintSheet());
  assert.match(await page.locator("#printSheet").textContent(), /Not sized/);
  await ctx.close();
});

const writeProjectsFile = (projects) => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ngu-")), "NGU Projects.json");
  fs.writeFileSync(file, JSON.stringify({ format: "pci.ngu.projects", version: 1, app: "1.6", exported: new Date().toISOString(), projects }));
  return file;
};
const okState = { inFlow: "90", inPurity: "97", inPsi: "135", inAir: "pci", inGp: "30", iLin: "", iKwh: "", iHrs: "168", iCap: "", capTouched: false };

test("projects: an imported file cannot inject markup through a project id", opts, async () => {
  const evil = 'x"><img src=x onerror="window.__pwned=1">';
  const file = writeProjectsFile([
    { id: evil, name: "Evil Id Co", at: Date.now(), v: "1.6", s: okState },
    { id: "seed-katrium", name: "Id Clash Co", at: Date.now(), v: "1.6", s: okState },
  ]);
  const { ctx, page, errors } = await rep("Avery Rep", "avery@pcigases.com");
  await page.click("#tab3");
  await page.waitForSelector(".proj-card");
  await page.setInputFiles("#pfileInput", file);
  await page.locator(".proj-card", { hasText: "Evil Id Co" }).waitFor();
  await page.evaluate(() => syncChain);
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.__pwned), undefined);
  assert.equal(await page.locator("#projList img").count(), 0);
  const ids = await page.locator("#projList [data-load]").evaluateAll((bs) => bs.map((b) => b.getAttribute("data-load")));
  assert.ok(ids.every((id) => /^[A-Za-z0-9_-]{1,64}$/.test(id)), `unexpected ids: ${ids}`);

  const saved = await srv.db.listProjects();
  const imported = saved.find((p) => p.name === "Evil Id Co");
  assert.ok(imported, "the project itself still imports");
  assert.match(imported.id, /^p[a-z0-9]+$/);
  // An id already used by another project is regenerated too, so the import does not overwrite it.
  assert.equal(saved.find((p) => p.id === "seed-katrium").name, "Katrium Chemical");
  assert.ok(saved.some((p) => p.name === "Id Clash Co" && p.id !== "seed-katrium"));
  assert.deepEqual(errors, []);
  for (const p of saved.filter((p) => ["Evil Id Co", "Id Clash Co"].includes(p.name))) await srv.db.deleteProject(p.id);
  await ctx.close();
});

test("projects: one malformed record from the server renders as an unreadable row, not a broken list", opts, async () => {
  const { ctx, page, errors } = await rep("Avery Rep", "avery@pcigases.com");
  const rows = [
    { id: "good-1", name: "Good One", at: 3000, v: "1.7", rep: "Avery Rep", s: { ...okState, inFlow: "100" } },
    { id: "bad-psi", name: "Bad Psi Co", at: 2000, v: "1.7", rep: "Old Rep", s: { ...okState, inPsi: "150" } },
    { id: "no-state", name: "Empty State Co", at: 1500, v: "1.7", rep: "Old Rep", s: {} },
    { id: "good-2", name: "Good Two", at: 1000, v: "1.7", rep: "Avery Rep", s: { ...okState, inPsi: "175" } },
  ];
  const deleted = [];
  await page.route("**/api/projects", (r) => r.fulfill({ json: { projects: rows } }));
  await page.route("**/api/projects/*", (r) => {
    if (r.request().method() !== "DELETE") return r.continue();
    deleted.push(decodeURIComponent(r.request().url().split("/").pop()));
    return r.fulfill({ json: { ok: true } });
  });
  await page.reload();
  await page.click("#tab3");
  await page.locator(".proj-card", { hasText: "Good Two" }).waitFor();
  assert.deepEqual(await page.locator(".proj-card__name").allInnerTexts(), ["Good One", "Bad Psi Co", "Empty State Co", "Good Two"]);
  assert.match(await page.locator(".proj-card", { hasText: "Good One" }).innerText(), /Type \d/);

  const bad = page.locator(".proj-card", { hasText: "Bad Psi Co" });
  assert.match(await bad.innerText(), /Unreadable project/);
  assert.match(await bad.innerText(), /unsupported feed air pressure/);
  assert.equal(await bad.locator("[data-load]").isDisabled(), true);
  assert.match(await page.locator(".proj-card", { hasText: "Empty State Co" }).innerText(), /Unreadable project/);

  // Still deletable: first click arms, second deletes.
  await bad.locator("[data-del]").click();
  await page.locator(".proj-card", { hasText: "Bad Psi Co" }).locator("[data-del]").click();
  await page.evaluate(() => syncChain);
  assert.deepEqual(deleted, ["bad-psi"]);
  assert.equal(await page.locator(".proj-card", { hasText: "Bad Psi Co" }).count(), 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("applyState leaves unsupported values alone and says which", opts, async () => {
  const { ctx, page, errors } = await rep("Avery Rep", "avery@pcigases.com");
  await size(page, { flow: 150, purity: 98, psi: 175 });
  const skipped = await page.evaluate(() => applyState({ inFlow: "120", inPurity: "99.9", inPsi: "150", inAir: "pci", iHrs: "lots" }));
  assert.deepEqual(skipped.sort(), ["iHrs", "inPsi", "inPurity"]);
  assert.equal(await page.inputValue("#inPsi"), "175");
  assert.equal(await page.inputValue("#inPurity"), "98");
  assert.equal(await page.inputValue("#inFlow"), "120");
  assert.match(await text(page, "#oType"), /Type \d/);

  // A stale draft with a bad value does not stop the page from starting.
  await page.evaluate(() => localStorage.setItem("pci.ngu.draft.v1",
    JSON.stringify({ v: "1.7", name: "", tab: 1, s: { inFlow: "100", inPurity: "97", inPsi: "150", inAir: "pci" } })));
  await page.reload();
  await page.waitForFunction(() => document.getElementById("nguWho").textContent.length > 0);
  assert.notEqual(await page.inputValue("#inPsi"), "");
  await page.click("#tab3");
  await page.waitForSelector(".proj-card");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("projects: an import skips records with unsupported values and says so", opts, async () => {
  const file = writeProjectsFile([
    { id: "pgoodimp", name: "Good Import Co", at: Date.now(), v: "1.6", s: okState },
    { id: "pbadimp", name: "Bad Import Co", at: Date.now(), v: "1.6", s: { ...okState, inPsi: "150" } },
  ]);
  const { ctx, page, errors } = await rep("Avery Rep", "avery@pcigases.com");
  await page.click("#tab3");
  await page.waitForSelector(".proj-card");
  await page.setInputFiles("#pfileInput", file);
  await page.locator(".proj-card", { hasText: "Good Import Co" }).waitFor();
  await page.evaluate(() => syncChain);
  assert.match(await text(page, "#projMsg"), /1 added.*Skipped 1 with values this toolkit does not offer: Bad Import Co/);
  assert.equal(await page.locator(".proj-card", { hasText: "Bad Import Co" }).count(), 0);
  const names = (await srv.db.listProjects()).map((p) => p.name);
  assert.ok(names.includes("Good Import Co") && !names.includes("Bad Import Co"));
  assert.deepEqual(errors, []);
  await srv.db.deleteProject("pgoodimp");
  await ctx.close();
});

test("save: inputs outside what the server accepts are refused with the reason", opts, async () => {
  const { ctx, page } = await rep("Avery Rep", "avery@pcigases.com");
  await size(page, { flow: 150, purity: 97, psi: 135 });
  await page.fill("#inGp", "85");
  await page.fill("#projName", "Too Much GP Co");
  await page.click("#projSave");
  assert.match(await text(page, "#projMsg"), /Not saved: gross profit must be 0 to 80/);
  await page.evaluate(() => syncChain);
  assert.ok(!(await srv.db.listProjects()).some((p) => p.name === "Too Much GP Co"));
  await ctx.close();
});
