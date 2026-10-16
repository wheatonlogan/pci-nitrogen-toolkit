import crypto from "node:crypto";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";

// One shared team password, plus the rep's name and email so saves and sizings
// carry who made them. Replaced by Microsoft Entra sign-in when the app moves
// into the PCI Hub. Hosted deployments fail closed: with no SITE_PASSWORD set
// nobody can sign in.
const COOKIE = "ngu_session";
const MAX_AGE = 60 * 60 * 24 * 30;

const secret = () =>
  process.env.SESSION_SECRET || (globalThis.__nguSecret ??= crypto.randomBytes(32).toString("hex"));

function sign(v) {
  return crypto.createHmac("sha256", secret()).update(v).digest("base64url");
}
function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export function checkPassword(pw) {
  const site = process.env.SITE_PASSWORD || "";
  return site !== "" && safeEqual(pw ?? "", site);
}

const clean = (s, max) => String(s ?? "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, max);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validate the sign-in form's identity fields. Returns {name, email} or null. */
export function identity(form) {
  const name = clean(form.name, 60);
  const email = clean(form.email, 120).toLowerCase();
  if (!name || !EMAIL.test(email)) return null;
  return { name, email };
}

// A keyed hash of the password a session signed in with. It is in the signed cookie, so
// changing SITE_PASSWORD signs everyone out.
const passwordTag = () => sign(`pw.${process.env.SITE_PASSWORD || ""}`).slice(0, 16);

/** Cookie value: "v2.<password tag>.<exp>.<user>.<sig>". */
export function encodeSession(user, now = Date.now()) {
  const exp = String(now + MAX_AGE * 1000);
  const body = Buffer.from(JSON.stringify(user)).toString("base64url");
  const payload = `v2.${passwordTag()}.${exp}.${body}`;
  return `${payload}.${sign(payload)}`;
}

/** v2 cookies need the current password's tag; older "<exp>.<user>.<sig>" cookies (issued
 *  before the tag existed) stay valid until they expire. */
export function decodeSession(value, now = Date.now()) {
  if (!value || !process.env.SITE_PASSWORD) return null;
  const parts = String(value).split(".");
  let exp, body;
  if (parts.length === 3) {
    [exp, body] = parts;
  } else if (parts.length === 5 && parts[0] === "v2") {
    if (!safeEqual(parts[1], passwordTag())) return null;
    [, , exp, body] = parts;
  } else return null;
  if (!safeEqual(parts.at(-1), sign(parts.slice(0, -1).join(".")))) return null;
  if (!(Number(exp) > now)) return null;
  try {
    const u = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return u && u.name && u.email ? { name: u.name, email: u.email } : null;
  } catch {
    return null;
  }
}

export function startSession(c, user) {
  setCookie(c, COOKIE, encodeSession(user), {
    httpOnly: true,
    secure: !!process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === "production",
    sameSite: "Lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}
export function endSession(c) {
  deleteCookie(c, COOKIE, { path: "/" });
}
export const currentUser = (c) => decodeSession(getCookie(c, COOKIE));

/** Middleware: pages redirect to /login, API calls get 401. */
export function requireUser() {
  return async (c, next) => {
    const user = currentUser(c);
    if (!user) {
      if (c.req.path.startsWith("/api/")) return c.json({ error: "unauthorized" }, 401);
      return c.redirect("/login");
    }
    c.set("user", user);
    await next();
  };
}
