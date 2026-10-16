import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createLoginLimiter, clientKeys, FREE_FAILURES, GLOBAL_FAILURES, MAX_DELAY_MS, IDLE_MS,
} from "../src/login-limit.js";

function clock(start = 1_000_000) {
  const c = { t: start, now: () => c.t, tick: (ms) => (c.t += ms) };
  return c;
}

test("free wrong guesses, then a lockout that doubles", () => {
  const c = clock();
  const lim = createLoginLimiter({ now: c.now });
  const k = ["1.2.3.4"];
  for (let i = 0; i < FREE_FAILURES; i++) {
    assert.equal(lim.check(k).ok, true);
    lim.fail(k);
  }
  assert.equal(lim.check(k).ok, true);
  lim.fail(k); // first locked failure: 1 s
  assert.deepEqual(lim.check(k), { ok: false, retryAfter: 1 });
  c.tick(1000);
  assert.equal(lim.check(k).ok, true);
  lim.fail(k); // 2 s
  assert.deepEqual(lim.check(k), { ok: false, retryAfter: 2 });
  c.tick(2000);
  lim.fail(k); // 4 s
  assert.deepEqual(lim.check(k), { ok: false, retryAfter: 4 });
});

test("lockout is capped at 15 minutes", () => {
  const c = clock();
  const lim = createLoginLimiter({ now: c.now });
  const k = ["1.2.3.4"];
  for (let i = 0; i < 60; i++) lim.fail(k);
  assert.equal(lim.check(k).retryAfter, MAX_DELAY_MS / 1000);
});

test("a successful sign-in clears the client", () => {
  const c = clock();
  const lim = createLoginLimiter({ now: c.now });
  const k = ["1.2.3.4"];
  for (let i = 0; i < FREE_FAILURES + 1; i++) lim.fail(k);
  assert.equal(lim.check(k).ok, false);
  lim.succeed(k);
  assert.equal(lim.check(k).ok, true);
});

test("other clients are not affected by one client's lockout", () => {
  const lim = createLoginLimiter({ now: clock().now });
  for (let i = 0; i < FREE_FAILURES + 3; i++) lim.fail(["1.1.1.1"]);
  assert.equal(lim.check(["1.1.1.1"]).ok, false);
  assert.equal(lim.check(["2.2.2.2"]).ok, true);
});

test("global cap pauses everyone until the window rolls over", () => {
  const c = clock();
  const lim = createLoginLimiter({ now: c.now });
  for (let i = 0; i < GLOBAL_FAILURES; i++) lim.fail([`10.0.${i >> 8}.${i & 255}`]);
  const r = lim.check(["9.9.9.9"]);
  assert.equal(r.ok, false);
  assert.equal(r.retryAfter, 60);
  c.tick(60_000);
  assert.equal(lim.check(["9.9.9.9"]).ok, true);
});

test("idle clients are forgotten", () => {
  const c = clock();
  const lim = createLoginLimiter({ now: c.now });
  for (let i = 0; i < FREE_FAILURES; i++) lim.fail(["1.2.3.4"]);
  c.tick(IDLE_MS + 1);
  lim.check(["1.2.3.4"]);
  lim.fail(["1.2.3.4"]); // counts as the first again, so no lockout
  assert.equal(lim.check(["1.2.3.4"]).ok, true);
});

test("clientKeys: X-Real-IP and the last X-Forwarded-For hop, never the spoofable first hop", () => {
  assert.deepEqual(clientKeys({ "x-real-ip": "5.5.5.5", "x-forwarded-for": "6.6.6.6, 5.5.5.5" }, "10.0.0.1"), ["5.5.5.5"]);
  assert.deepEqual(clientKeys({ "x-forwarded-for": "6.6.6.6, 7.7.7.7" }, "10.0.0.1"), ["7.7.7.7"]);
  assert.deepEqual(clientKeys({}, "10.0.0.1"), ["10.0.0.1"]);
  assert.deepEqual(clientKeys(new Headers({ "x-real-ip": "5.5.5.5" }), undefined), ["5.5.5.5"]);
});

test("a forged X-Real-IP is still charged under the proxy's X-Forwarded-For hop", () => {
  const lim = createLoginLimiter({ now: clock().now });
  for (let i = 0; i < FREE_FAILURES + 1; i++) {
    lim.fail(clientKeys({ "x-real-ip": `forged-${i}`, "x-forwarded-for": "8.8.8.8" }));
  }
  assert.equal(lim.check(clientKeys({ "x-real-ip": "forged-new", "x-forwarded-for": "8.8.8.8" })).ok, false);
});

test("a forged X-Forwarded-For is still charged under X-Real-IP", () => {
  const lim = createLoginLimiter({ now: clock().now });
  for (let i = 0; i < FREE_FAILURES + 1; i++) {
    lim.fail(clientKeys({ "x-real-ip": "8.8.8.8", "x-forwarded-for": `forged-${i}` }));
  }
  assert.equal(lim.check(clientKeys({ "x-real-ip": "8.8.8.8", "x-forwarded-for": "forged-new" })).ok, false);
});
