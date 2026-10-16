// Login throttling for the shared team password: per client and global, with backoff.
//
// Each client gets FREE_FAILURES wrong guesses; after that every wrong guess locks it out for
// twice as long as the last (1 s, 2 s, 4 s ... up to 15 min). A sign-in that works clears it.
// On top of that, more than GLOBAL_FAILURES wrong guesses a minute from everyone together
// pause all sign-ins until the minute rolls over, so rotating addresses doesn't help either.
//
// Call check() and fail()/succeed() with no await in between, so parallel requests can't all
// slip past check() before the first failure is counted.

export const FREE_FAILURES = 5;
export const BASE_DELAY_MS = 1000;
export const MAX_DELAY_MS = 15 * 60 * 1000;
export const IDLE_MS = 60 * 60 * 1000; // forget a client this long after its last wrong guess
export const GLOBAL_FAILURES = 100;
export const GLOBAL_WINDOW_MS = 60 * 1000;

/**
 * The keys one request is counted under. Behind Railway's edge the peer address is the proxy,
 * so the client comes from headers: X-Real-IP (set by the edge) and the last X-Forwarded-For
 * hop (appended by the proxy; earlier hops are whatever the client sent). A request is
 * charged under every key it presents, so forging one header doesn't escape the limit while
 * the other still names the real client. The peer address counts only with neither header.
 */
export function clientKeys(headers, peer) {
  const h = (name) => {
    const v = typeof headers.get === "function" ? headers.get(name) : headers[name];
    return Array.isArray(v) ? v.join(",") : v;
  };
  const keys = new Set();
  const real = String(h("x-real-ip") ?? "").trim().slice(0, 64);
  if (real) keys.add(real);
  const last = String(h("x-forwarded-for") ?? "").split(",").pop().trim().slice(0, 64);
  if (last) keys.add(last);
  if (!keys.size) keys.add(String(peer || "unknown").slice(0, 64));
  return [...keys];
}

export function createLoginLimiter({ now = Date.now } = {}) {
  const clients = new Map(); // key -> { fails, until, last }
  let global = []; // timestamps of recent wrong guesses, oldest first

  function prune(t) {
    global = global.filter((x) => t - x < GLOBAL_WINDOW_MS);
    for (const [k, s] of clients) if (t - s.last > IDLE_MS && s.until <= t) clients.delete(k);
  }

  return {
    /** {ok: true}, or {ok: false, retryAfter} in whole seconds when the caller must wait. */
    check(keys) {
      const t = now();
      prune(t);
      let until = 0;
      for (const k of keys) until = Math.max(until, clients.get(k)?.until ?? 0);
      if (global.length >= GLOBAL_FAILURES) until = Math.max(until, global[0] + GLOBAL_WINDOW_MS);
      return until > t ? { ok: false, retryAfter: Math.max(1, Math.ceil((until - t) / 1000)) } : { ok: true };
    },
    fail(keys) {
      const t = now();
      global.push(t);
      for (const k of keys) {
        const s = clients.get(k) ?? { fails: 0, until: 0, last: t };
        s.fails += 1;
        s.last = t;
        if (s.fails > FREE_FAILURES) {
          s.until = t + Math.min(BASE_DELAY_MS * 2 ** (s.fails - FREE_FAILURES - 1), MAX_DELAY_MS);
        }
        clients.set(k, s);
      }
    },
    succeed(keys) {
      for (const k of keys) clients.delete(k);
    },
    reset() {
      clients.clear();
      global = [];
    },
  };
}
