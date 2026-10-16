// In-memory stand-in for src/db.js, used by the tests when TEST_DATABASE_URL is not set.
// Same interface and the behaviour the app relies on: rows shaped like db.js returns them,
// case-insensitive unique names, seed-once, newest first. SQL details (types, timestamp
// limits) are only exercised against a real Postgres.
import fs from "node:fs";

export function createMemoryDb() {
  const projects = new Map();
  let sizing = [];
  const meta = new Map();
  let seq = 0;

  const copy = (v) => JSON.parse(JSON.stringify(v));
  const row = (r) => ({ id: r.id, name: r.name, at: r.at, v: r.v, s: copy(r.s), rep: r.rep });

  return {
    // Only what the app and tests send: the health check and clearing the sizing log.
    pool: {
      async query(sql) {
        const q = sql.trim().replace(/\s+/g, " ");
        if (/^select 1$/i.test(q)) return { rows: [{ "?column?": 1 }], rowCount: 1 };
        if (/^delete from ngu_sizing_events$/i.test(q)) {
          const n = sizing.length;
          sizing = [];
          return { rows: [], rowCount: n };
        }
        throw new Error(`memory db does not run SQL: ${q}`);
      },
    },

    async migrate() {},

    async seed(file) {
      if (meta.has("seed_version")) return 0;
      const data = JSON.parse(fs.readFileSync(file, "utf8"));
      let n = 0;
      for (const p of data.projects || []) {
        const taken = [...projects.values()].some((x) => x.id === p.id || x.name.toLowerCase() === p.name.toLowerCase());
        if (taken) continue;
        projects.set(p.id, { id: p.id, name: p.name, s: copy(p.s), v: p.v || "", at: p.at || Date.now(), rep: "PCI stock project" });
        n++;
      }
      meta.set("seed_version", "1");
      return n;
    },

    async listProjects() {
      return [...projects.values()].sort((a, b) => b.at - a.at).map(row);
    },

    async saveProject(p, user) {
      const clash = [...projects.values()].find((x) => x.id !== p.id && x.name.toLowerCase() === p.name.toLowerCase());
      if (clash) return { conflict: p.name };
      const r = { id: p.id, name: p.name, s: copy(p.s), v: p.v || "", at: p.at, rep: user.name };
      projects.set(p.id, r);
      return { project: row(r) };
    },

    async deleteProject(id) {
      return projects.delete(id);
    },

    async logSizing(e, user) {
      sizing.push({
        id: ++seq, at: new Date(), rep: user.name, rep_email: user.email, project: e.project,
        flow_scfm: e.flow, purity: e.purity, feed_psig: e.psi, air_by: e.airBy, ngu_type: e.type,
        feed_air_scfm: e.air, compressor_kw: e.compKw, price: e.price, outcome: e.outcome,
      });
    },

    async listSizing(limit = 500) {
      return [...sizing].sort((a, b) => b.at - a.at || b.id - a.id).slice(0, limit).map((r) => ({ ...r }));
    },

    end: async () => {},
  };
}
