// Pure tests of the project validation in src/app.js (no server, no browser).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { cleanProject, projectProblem, stateProblem, STATE_CHOICES, STATE_RANGES } from "../src/app.js";
import { ROOT } from "./helpers.js";

const html = fs.readFileSync(path.join(ROOT, "public", "toolkit.html"), "utf8");
const seed = JSON.parse(fs.readFileSync(path.join(ROOT, "seed", "projects.json"), "utf8"));
const good = { inFlow: "120", inPurity: "98", inPsi: "135", inAir: "pci", inGp: "30", iLin: "90000", iKwh: "0.08", iHrs: "168", iCap: "", capTouched: false };

test("the server's choices are exactly the toolkit's <select> options", () => {
  for (const [id, opts] of Object.entries(STATE_CHOICES)) {
    const m = html.match(new RegExp(`<select[^>]*id="${id}"[^>]*>([\\s\\S]*?)</select>`));
    assert.ok(m, `no <select id="${id}"> in toolkit.html`);
    assert.deepEqual([...m[1].matchAll(/<option value="([^"]*)"/g)].map((x) => x[1]), opts, id);
  }
});

test("the server's ranges match the toolkit's number inputs wherever the page sets min/max", () => {
  for (const [id, [lo, hi]] of Object.entries(STATE_RANGES)) {
    const tag = html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`));
    assert.ok(tag && /type="number"/.test(tag[0]), `no number input #${id}`);
    const min = tag[0].match(/\smin="([^"]+)"/), max = tag[0].match(/\smax="([^"]+)"/);
    if (min) assert.equal(lo, Number(min[1]), `${id} min`);
    if (max) assert.equal(hi, Number(max[1]), `${id} max`);
  }
});

test("the page's own copy of the ranges matches the server's", () => {
  const m = html.match(/const STATE_RANGES = (\{[^}]*\});/);
  assert.ok(m, "STATE_RANGES not found in toolkit.html");
  assert.deepEqual(JSON.parse(m[1].replace(/(\w+):/g, '"$1":')), STATE_RANGES);
});

test("seeded stock projects and a full toolkit save are accepted", () => {
  for (const p of seed.projects) assert.equal(projectProblem(p.id, p), null, p.name);
  assert.equal(stateProblem(good), null);
  assert.equal(stateProblem({ ...good, inFlow: "", iHrs: "", iCap: "185000", capTouched: true }), null);
  assert.equal(stateProblem({ inFlow: 100, inPurity: 99.5, inPsi: 200 }), null, "numbers as well as strings");
  const p = cleanProject("p1", { name: " Acme ", at: 5, v: "1.7", s: { ...good, extra: "<b>" } });
  assert.deepEqual(p, { id: "p1", name: "Acme", s: good, v: "1.7", at: 5 });
});

test("ids the toolkit would not generate are refused", () => {
  for (const id of ['x"><img src=x onerror=alert(1)>', "a b", "", "a".repeat(65), "../x"])
    assert.equal(projectProblem(id, { name: "X", s: good }), "invalid project id", id);
  for (const id of ["seed-katrium", "p" + Date.now().toString(36) + "ab12", "A_b-9"])
    assert.equal(projectProblem(id, { name: "X", s: good }), null, id);
});

test("inputs the toolkit does not offer are refused with a clear reason", () => {
  const cases = [
    [{ inPsi: "150" }, "inPsi must be one of 125, 135, 175, 200"],
    [{ inPurity: "99.9" }, /^inPurity must be one of/],
    [{ inPurity: "" }, /^inPurity must be one of/],
    [{ inAir: "theirs" }, "inAir must be one of pci, cust"],
    [{ inAir: ["pci"] }, /^inAir must be one of/],
    [{ inFlow: "lots" }, "inFlow must be a number from 0 to 100000"],
    [{ inFlow: "-5" }, /^inFlow must be/],
    [{ inFlow: "Infinity" }, /^inFlow must be/],
    [{ inFlow: true }, /^inFlow must be/],
    [{ inGp: "95" }, "inGp must be a number from 0 to 80"],
    [{ iHrs: "0" }, "iHrs must be a number from 1 to 168"],
    [{ iKwh: "NaN" }, /^iKwh must be/],
    [{ iLin: " " }, /^iLin must be/],
  ];
  for (const [patch, msg] of cases) {
    const got = stateProblem({ ...good, ...patch });
    if (msg instanceof RegExp) assert.match(got || "", msg, JSON.stringify(patch));
    else assert.equal(got, msg, JSON.stringify(patch));
    assert.equal(cleanProject("p1", { name: "X", s: { ...good, ...patch } }), null);
  }
  assert.equal(stateProblem({ inFlow: "100", inPurity: "97" }), "inPsi is required");
  assert.equal(stateProblem(null), "missing inputs");
  assert.equal(stateProblem([]), "missing inputs");
  assert.equal(projectProblem("p1", { name: "  ", s: good }), "project name is required");
});
