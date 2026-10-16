import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { identity, encodeSession, decodeSession, checkPassword } from "../src/auth.js";

process.env.SESSION_SECRET = "unit-secret";
process.env.SITE_PASSWORD = "unit-password";

test("identity needs a name and a valid email", () => {
  assert.deepEqual(identity({ name: " Logan ", email: "Logan@PCIGases.com " }), { name: "Logan", email: "logan@pcigases.com" });
  assert.equal(identity({ name: "", email: "a@b.co" }), null);
  assert.equal(identity({ name: "Logan", email: "not-an-email" }), null);
  assert.equal(identity({}), null);
});

test("session round-trips and carries the rep", () => {
  const v = encodeSession({ name: "Logan", email: "l@p.com" });
  assert.deepEqual(decodeSession(v), { name: "Logan", email: "l@p.com" });
});

test("a tampered session is rejected", () => {
  const v = encodeSession({ name: "Logan", email: "l@p.com" });
  const [exp, , sig] = v.split(".");
  const forged = Buffer.from(JSON.stringify({ name: "Someone else", email: "x@y.com" })).toString("base64url");
  assert.equal(decodeSession(`${exp}.${forged}.${sig}`), null);
  assert.equal(decodeSession(v.slice(0, -2) + "xx"), null);
  assert.equal(decodeSession("garbage"), null);
});

test("an expired session is rejected", () => {
  const v = encodeSession({ name: "Logan", email: "l@p.com" }, Date.now() - 31 * 86400e3);
  assert.equal(decodeSession(v), null);
});

test("no SITE_PASSWORD means nobody signs in", () => {
  const saved = process.env.SITE_PASSWORD;
  delete process.env.SITE_PASSWORD;
  assert.equal(checkPassword(""), false);
  assert.equal(checkPassword("anything"), false);
  process.env.SITE_PASSWORD = "right";
  assert.equal(checkPassword("right"), true);
  assert.equal(checkPassword("wrong"), false);
  if (saved === undefined) delete process.env.SITE_PASSWORD; else process.env.SITE_PASSWORD = saved;
});

test("changing SITE_PASSWORD ends sessions issued under the old one", () => {
  const v = encodeSession({ name: "Logan", email: "l@p.com" });
  process.env.SITE_PASSWORD = "rotated-password";
  try {
    assert.equal(decodeSession(v), null);
    assert.deepEqual(decodeSession(encodeSession({ name: "Logan", email: "l@p.com" })), { name: "Logan", email: "l@p.com" });
  } finally {
    process.env.SITE_PASSWORD = "unit-password";
  }
  assert.deepEqual(decodeSession(v), { name: "Logan", email: "l@p.com" });
});

test("a v2 cookie with a forged password tag is rejected", () => {
  const [, , exp, body] = encodeSession({ name: "Logan", email: "l@p.com" }).split(".");
  const payload = `v2.${"0".repeat(16)}.${exp}.${body}`;
  const sig = crypto.createHmac("sha256", "unit-secret").update(payload).digest("base64url");
  assert.equal(decodeSession(`${payload}.${sig}`), null);
});

test("cookies from before the password tag stay valid until they expire", () => {
  const legacy = (exp) => {
    const body = Buffer.from(JSON.stringify({ name: "Old", email: "o@p.com" })).toString("base64url");
    const payload = `${exp}.${body}`;
    return `${payload}.${crypto.createHmac("sha256", "unit-secret").update(payload).digest("base64url")}`;
  };
  assert.deepEqual(decodeSession(legacy(Date.now() + 60_000)), { name: "Old", email: "o@p.com" });
  assert.equal(decodeSession(legacy(Date.now() - 1)), null);
});

test("no SITE_PASSWORD means no session is valid", () => {
  const v = encodeSession({ name: "Logan", email: "l@p.com" });
  delete process.env.SITE_PASSWORD;
  try {
    assert.equal(decodeSession(v), null);
  } finally {
    process.env.SITE_PASSWORD = "unit-password";
  }
});
