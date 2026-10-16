import fs from "node:fs";
import pg from "pg";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS ngu_projects (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  state       JSONB NOT NULL,
  app_version TEXT NOT NULL DEFAULT '',
  saved_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  saved_by    TEXT NOT NULL DEFAULT '',
  saved_by_email TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ngu_projects_name_key ON ngu_projects (lower(name));

CREATE TABLE IF NOT EXISTS ngu_sizing_events (
  id          BIGSERIAL PRIMARY KEY,
  at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  rep         TEXT NOT NULL DEFAULT '',
  rep_email   TEXT NOT NULL DEFAULT '',
  project     TEXT,
  flow_scfm   REAL,
  purity      REAL,
  feed_psig   REAL,
  air_by      TEXT,
  ngu_type    INTEGER,
  feed_air_scfm REAL,
  compressor_kw INTEGER,
  price       REAL,
  outcome     TEXT NOT NULL DEFAULT 'sized'
);
CREATE INDEX IF NOT EXISTS ngu_sizing_events_at ON ngu_sizing_events (at DESC);

CREATE TABLE IF NOT EXISTS ngu_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export function createDb(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const pool = new pg.Pool({ connectionString, max: 5 });

  const row = (r) => ({
    id: r.id,
    name: r.name,
    at: new Date(r.saved_at).getTime(),
    v: r.app_version,
    s: r.state,
    rep: r.saved_by,
  });

  return {
    pool,
    async migrate() {
      await pool.query(SCHEMA);
    },

    /** Stock projects go in once. A project the team later deletes stays deleted. */
    async seed(file) {
      const done = await pool.query("SELECT value FROM ngu_meta WHERE key = 'seed_version'");
      if (done.rowCount) return 0;
      const data = JSON.parse(fs.readFileSync(file, "utf8"));
      let n = 0;
      for (const p of data.projects || []) {
        const r = await pool.query(
          `INSERT INTO ngu_projects (id, name, state, app_version, saved_at, saved_by)
           VALUES ($1, $2, $3, $4, to_timestamp($5 / 1000.0), 'PCI stock project')
           ON CONFLICT DO NOTHING`,
          [p.id, p.name, p.s, p.v || "", p.at || Date.now()],
        );
        n += r.rowCount;
      }
      await pool.query("INSERT INTO ngu_meta (key, value) VALUES ('seed_version', '1') ON CONFLICT DO NOTHING");
      return n;
    },

    async listProjects() {
      const r = await pool.query("SELECT * FROM ngu_projects ORDER BY saved_at DESC");
      return r.rows.map(row);
    },

    /**
     * Insert or replace a project by id. Names are unique across the team
     * (case-insensitive), matching the toolkit's own save rule.
     * Returns {project} or {conflict: existingName}.
     */
    async saveProject(p, user) {
      try {
        const r = await pool.query(
          `INSERT INTO ngu_projects (id, name, state, app_version, saved_at, saved_by, saved_by_email)
           VALUES ($1, $2, $3, $4, to_timestamp($5 / 1000.0), $6, $7)
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name, state = EXCLUDED.state, app_version = EXCLUDED.app_version,
             saved_at = EXCLUDED.saved_at, saved_by = EXCLUDED.saved_by, saved_by_email = EXCLUDED.saved_by_email
           RETURNING *`,
          [p.id, p.name, p.s, p.v || "", p.at, user.name, user.email],
        );
        return { project: row(r.rows[0]) };
      } catch (e) {
        if (e.code === "23505") return { conflict: p.name };
        throw e;
      }
    },

    async deleteProject(id) {
      const r = await pool.query("DELETE FROM ngu_projects WHERE id = $1", [id]);
      return r.rowCount > 0;
    },

    async logSizing(e, user) {
      await pool.query(
        `INSERT INTO ngu_sizing_events
           (rep, rep_email, project, flow_scfm, purity, feed_psig, air_by, ngu_type, feed_air_scfm, compressor_kw, price, outcome)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [user.name, user.email, e.project, e.flow, e.purity, e.psi, e.airBy, e.type, e.air, e.compKw, e.price, e.outcome],
      );
    },

    async listSizing(limit = 500) {
      const r = await pool.query("SELECT * FROM ngu_sizing_events ORDER BY at DESC LIMIT $1", [limit]);
      return r.rows;
    },

    end: () => pool.end(),
  };
}
