"""One-off conversion of the offline toolkit (v1.6) into the hosted page (v1.7).

Kept in the repo as a record of exactly what changed from the offline file.
Usage: python3 scripts/hostify.py "<path to v1.6 html>" public/toolkit.html
Every replacement must match exactly once, or the script stops.
"""
import sys

src, dst = sys.argv[1], sys.argv[2]
html = open(src, encoding="utf-8").read()


def sub(old, new, count=1):
    global html
    n = html.count(old)
    if n != count:
        sys.exit(f"expected {count} match(es), found {n}: {old[:80]!r}")
    html = html.replace(old, new)


# ---------------------------------------------------------------- header + bar
sub('Internal use. <strong>v1.6</strong></p>',
    'Internal use. <strong>v1.7</strong></p>\n'
    '      <div class="pci-small ngu-user" id="nguUser" hidden><span id="nguWho"></span> &middot; '
    '<form method="post" action="/logout"><button class="ngu-link" type="submit">Sign out</button></form></div>')

sub('<button class="pci-btn pci-btn--primary" id="projSave" type="button">Save</button>',
    '<button class="pci-btn pci-btn--primary" id="projSave" type="button">Save</button>\n'
    '    <button class="pci-btn pci-btn--secondary" id="projPrint" type="button">Print spec sheet</button>')

# ---------------------------------------------------------------- tab 3 copy
sub('''      Held in this browser for speed. Connect a projects file below and they live on your
      computer instead, where a browser reset cannot reach them.
      The projects that came with the toolkit''',
    '''      Saved to the PCI server and shared with the whole sales team, so a project saved on
      one laptop opens on any other. Each card shows who saved it last.
      The stock projects''')

sub('''      <div class="pci-eyebrow">Projects file</div>
      <p class="pci-small" style="margin-top:var(--sp-2)">
        Keep your projects in a file on your computer and they outlive the browser &mdash;
        a cleared cache, a new laptop, a colleague who needs the same numbers.
        Put it somewhere that gets backed up. You can also drop a projects file
        anywhere on this tab to open it.</p>''',
    '''      <div class="pci-eyebrow">Import or export</div>
      <p class="pci-small" style="margin-top:var(--sp-2)">
        Have projects in the offline toolkit? Open its <strong>NGU Projects.json</strong> here,
        or drop it anywhere on this tab, and they join the team list. Download a copy to
        take the projects offline.</p>''')

# ---------------------------------------------------------------- print sheet
sub('''  </div>

</main>''', '''  </div>

  <section id="printSheet" class="print-sheet" aria-hidden="true"></section>

</main>''')

# ---------------------------------------------------------------- CSS
sub('</style></head>', '''
/* ---------- hosted v1.7: signed-in rep + one-page spec sheet ---------- */
.ngu-user { margin-top: var(--sp-1); color: var(--ink-secondary); }
.ngu-user form { display: inline; }
.ngu-link { background: none; border: 0; padding: 0; font: inherit; color: var(--ink-brand);
  text-decoration: underline; cursor: pointer; }
.print-sheet { display: none; }
@media print {
  @page { size: letter; margin: 13mm 14mm; }
  main.pci-app > :not(#printSheet) { display: none !important; }
  main.pci-app > #printSheet { display: block !important; }
  main.pci-app { padding: 0 !important; margin: 0 !important; max-width: none !important; }
  body { background: #fff !important; }
}
.print-sheet, .print-sheet * { color: #1d1d1d; }
.ps-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px;
  border-bottom: 2.5px solid #00338D; padding-bottom: 8px; }
.ps-head img { width: 150px; height: auto; display: block; }
.ps-head .ps-title { text-align: right; }
.ps-head h1 { font-family: var(--font-display); font-size: 20px; font-weight: 500; color: #00338D; margin: 0; }
.ps-head p { font-size: 11px; color: #555; margin: 2px 0 0; }
.ps-project { font-family: var(--font-display); font-size: 17px; color: #00338D; margin: 12px 0 0; }
.ps-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 26px; margin-top: 10px; }
.ps-block h2 { font-family: var(--font-eyebrow); text-transform: uppercase; letter-spacing: .06em;
  font-size: 11px; font-weight: 400; color: #00338D; border-bottom: 1px solid #c9c9c9;
  padding-bottom: 3px; margin: 0 0 3px; }
.ps-table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
.ps-table th { text-align: left; font-weight: 400; color: #555; padding: 3px 10px 3px 0; width: 44%; vertical-align: top; }
.ps-table td { padding: 3px 0; font-variant-numeric: tabular-nums; vertical-align: top; }
.ps-table td small { color: #666; font-size: 10px; }
.ps-key { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 12px; }
.ps-key div { border-left: 3px solid #06B4FE; padding: 2px 0 2px 8px; }
.ps-key span { display: block; font-family: var(--font-eyebrow); text-transform: uppercase; letter-spacing: .06em; font-size: 10px; color: #555; }
.ps-key strong { display: block; font-family: var(--font-display); font-size: 17px; font-weight: 500; color: #00338D; }
.ps-notes { margin-top: 12px; font-size: 10.5px; border-left: 3px solid #F28C28; padding: 2px 0 2px 10px; }
.ps-notes p { margin: 0 0 4px; }
.ps-foot { margin-top: 14px; border-top: 1px solid #c9c9c9; padding-top: 6px; font-size: 9px; color: #666; line-height: 1.45; }
</style></head>''')

# ---------------------------------------------------------------- JS: version
sub('const VER   = "1.6";', 'const VER   = "1.7";')

# ---------------------------------------------------------------- JS: store
sub('''function loadAll(){
  if (!storageOK) return [];
  try { const a = JSON.parse(localStorage.getItem(STORE) || "[]"); return Array.isArray(a) ? a : []; }
  catch(e){ return []; }
}
function writeAll(list){
  try { localStorage.setItem(STORE, JSON.stringify(list)); return true; }
  catch(e){ return false; }
}''', '''/* Hosted (v1.7): the team's projects live on the server. PROJ is this page's
   copy; writeAll() updates it at once and sends the difference to the server.
   A failed write says so and reloads the server's list, so the page never
   claims a save the server does not hold. */
let PROJ = [];
let PROJ_LOADED = false;
const clone = p => Object.assign({}, p, {s: Object.assign({}, p.s)});
function loadAll(){ return PROJ.map(clone); }
function writeAll(list){
  const before = new Map(PROJ.map(p => [p.id, p]));
  const after  = new Set(list.map(p => p.id));
  const puts = list.filter(p => {
    const b = before.get(p.id);
    return !b || b.at !== p.at || b.name !== p.name || JSON.stringify(b.s) !== JSON.stringify(p.s);
  });
  const dels = [...before.keys()].filter(id => !after.has(id));
  PROJ = list.map(p => Object.assign(clone(p), {rep: before.has(p.id) && !puts.includes(p) ? before.get(p.id).rep : (window.NGU_USER ? NGU_USER.name : p.rep)}));
  syncServer(puts, dels);
  return true;
}

let syncChain = Promise.resolve();
function syncServer(puts, dels){
  syncChain = syncChain.then(async () => {
    let failed = 0, conflict = null;
    for (const p of puts){
      try {
        const r = await fetch("/api/projects/" + encodeURIComponent(p.id), {
          method: "PUT", headers: {"Content-Type": "application/json"},
          body: JSON.stringify({name: p.name, at: p.at, v: p.v, s: p.s})
        });
        if (r.status === 401) return signedOut();
        if (r.status === 409){ conflict = p.name; continue; }
        if (!r.ok){ failed++; continue; }
      } catch(e){ failed++; }
    }
    for (const id of dels){
      try {
        const r = await fetch("/api/projects/" + encodeURIComponent(id), {method: "DELETE"});
        if (r.status === 401) return signedOut();
        if (!r.ok && r.status !== 404) failed++;
      } catch(e){ failed++; }
    }
    if (conflict || failed){
      await reloadProjects();
      if (conflict) flash(`Someone on the team already has a project called "${conflict}". Load theirs or pick another name.`, true);
      else flash("Could not reach the server, so that change was not saved. Check your connection and try again.", true);
    }
  });
  return syncChain;
}

async function reloadProjects(){
  try {
    const r = await fetch("/api/projects", {cache: "no-store"});
    if (r.status === 401) return signedOut();
    if (!r.ok) throw new Error(r.status);
    PROJ = ((await r.json()).projects || []).sort((a,b) => b.at - a.at);
    PROJ_LOADED = true;
  } catch(e){
    PROJ_LOADED = "error";
  }
  const nm = el("projName").value.trim().toLowerCase();
  const hit = nm ? PROJ.find(p => p.name.toLowerCase() === nm) : null;
  activeId = hit ? hit.id : null;
  renderProjects();
  paintFile();
}

function signedOut(){
  flash("Your sign-in has expired. Reloading to sign in again.", true);
  setTimeout(() => location.assign("/login"), 1500);
}''')

# renderProjects: loading state instead of the localStorage check, and who saved it
sub('''  if (!storageOK){
    wrap.innerHTML = `<p class="pci-small proj-empty">This browser will not let the page store anything,
      so projects cannot be saved here. The calculator still works normally.</p>`;
    return;
  }
  const list = loadAll();''', '''  if (PROJ_LOADED === false){
    wrap.innerHTML = `<p class="pci-small proj-empty">Loading the team's projects&hellip;</p>`;
    return;
  }
  if (PROJ_LOADED === "error"){
    wrap.innerHTML = `<p class="pci-small proj-empty">Could not load the team's projects from the server.
      The calculator still works. Reload the page to try again.</p>`;
    return;
  }
  const list = loadAll();''')

sub('<span class="proj-card__meta"> &middot; ${when}</span>',
    '<span class="proj-card__meta"> &middot; ${when}${pr.rep ? " &middot; " + esc(pr.rep) : ""}</span>')

# saveProject: storage is the server now; log the save
sub('''  if (!storageOK){ flash("This browser will not store saved projects", true); return; }

  const list = loadAll();''', '''  if (PROJ_LOADED !== true){ flash("The team's projects have not loaded yet, so this cannot be saved", true); return; }

  const list = loadAll();''')
sub('''  flash(i >= 0 ? "Updated " + name : "Saved " + name);
  renderProjects();
  saveDraft();
  if (fh) writeFile(true); else paintFile();''', '''  flash(i >= 0 ? "Updated " + name : "Saved " + name);
  renderProjects();
  saveDraft();
  logSizing("saved");
  paintFile();''')

# ---------------------------------------------------------------- JS: no browser seeding
start = html.index("(function seed(){")
end = html.index("})();", start) + len("})();")
html = html[:start] + "/* Hosted: stock projects are seeded once on the server (seed/projects.json). */" + html[end:]

# ---------------------------------------------------------------- JS: projects file = import/export only
sub('''const hasFSA = typeof window.showSaveFilePicker === "function"
            && typeof window.showOpenFilePicker === "function";''',
    'const hasFSA = false;   /* hosted: the server is the durable copy; files are import/export */')

sub('''function unwritten(){
  let last = 0;''', '''function unwritten(){ return 0; }
function unwrittenOffline(){
  let last = 0;''')
sub('''  if (!storageOK){ el("pfile").hidden = true; return; }
  const btn =''', '''  const btn =''')
sub('''    st.textContent = loadAll().length ? "Everything here is in your file." : "";''',
    '''    st.textContent = PROJ_LOADED === true ? "Projects save straight to the PCI server." : "";''')

# ---------------------------------------------------------------- customer-air note (roadmap 2.4)
sub('''    &middot; ${s.cust ? "customer's own compressed air" : s.comp.kw + " kW compressor"} &middot; indicative ${money(s.price)}.
    <span class="pci-muted">Change any of it on tab 1.</span>`;''', '''    &middot; ${s.cust ? "customer's own compressed air" : s.comp.kw + " kW compressor"} &middot; indicative ${money(s.price)}.
    <span class="pci-muted">Change any of it on tab 1.</span>
    ${s.cust ? `<br><span style="color:var(--pci-progressive-orange)">${custAirNote(s)}</span>` : ""}`;''')

sub('''/* ---- inline SVG chart ---- */''', '''/* Customer-supplied air is not free: the compressor power is on their meter. */
function custAirNote(s){
  const c = pickCompressor(s.air);
  return `<strong>Customer's air is not free.</strong> Making ${num(s.air)} scfm / ${m3h(s.air)} of compressed air takes
    roughly ${c ? "a " + c.kw + " kW compressor" : "a large compressor"} on the customer's own meter. That power is not in the
    running cost here, so the saving shown is higher than the customer will actually see.`;
}

/* ---- inline SVG chart ---- */''')

sub('''  set("oType", "Type " + type,''', '''  if (airBy === "cust"){
    const c = pickCompressor(air);
    v.innerHTML += `<p class="pci-small" style="margin-top:.35rem;color:var(--pci-progressive-orange)"><strong>Customer's air:</strong>
      ${num(air)} scfm of feed air is roughly ${c ? "a " + c.kw + " kW compressor" : "a large compressor"} running on their meter. Tab 2 does not count it.</p>`;
  }

  set("oType", "Type " + type,''')

# ---------------------------------------------------------------- boot, sizing log, print sheet
sub('''renderProjects();


</script></body></html>''', r'''renderProjects();

/* =====================================================================
   HOSTED  (v1.7)
   Who is signed in, the team's projects from the server, a log of what
   gets sized, and the one-page spec sheet that Print produces.
   ===================================================================== */
window.NGU_USER = null;
(async function boot(){
  try {
    const r = await fetch("/api/me", {cache: "no-store"});
    if (r.status === 401) return signedOut();
    if (r.ok){
      NGU_USER = await r.json();
      el("nguWho").textContent = NGU_USER.name;
      el("nguUser").hidden = false;
    }
  } catch(e){}
  await reloadProjects();
})();

/* ---- sizing log: one entry when the tab-1 inputs settle on a valid unit ---- */
const LOG_DELAY = window.__nguLogDelay || 4000;
let lastLogged = "", logTimer = null;
function logSizing(outcome){
  const s = sized();
  if (!s) return;
  const ev = {
    project: el("projName").value.trim() || null, outcome,
    flow: s.flow, purity: s.purity, psi: s.psi, airBy: s.cust ? "cust" : "pci",
    type: s.type, air: Math.round(s.air), compKw: s.cust ? null : s.comp.kw, price: Math.round(s.price)
  };
  if (outcome === "sized"){
    const key = [ev.flow, ev.purity, ev.psi, ev.airBy].join("|");
    if (key === lastLogged) return;
    lastLogged = key;
  }
  fetch("/api/sizing", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(ev)})
    .catch(() => {});
}
F1.forEach(id => el(id).addEventListener("input", () => {
  clearTimeout(logTimer);
  logTimer = setTimeout(() => logSizing("sized"), LOG_DELAY);
}));

/* ---- one-page spec sheet ---- */
function buildPrintSheet(){
  const s = sized();
  payback();                                   /* make tab 2's figures current */
  const now = new Date();
  const date = now.toLocaleDateString("en-US", {year: "numeric", month: "long", day: "numeric"});
  const rep = NGU_USER ? NGU_USER.name : "";
  const name = el("projName").value.trim() || "Unnamed project";
  const logo = (document.querySelector(".pci-logo--light") || {}).src || "";
  const txt = id => el(id).textContent.replace(/\s+/g, " ").trim();
  const row = (k, v) => `<tr><th>${k}</th><td>${v}</td></tr>`;

  let body;
  if (!s){
    body = `<div class="ps-notes"><p><strong>Not sized.</strong> These inputs do not resolve to a single NGU Type-X unit.</p>
      <p>${esc(el("verdict").textContent.replace(/\s+/g, " ").trim())}</p></div>`;
  } else {
    const out = deliver(s.psi, s.type, s.purity);
    const gp = Math.round(gpNow() * 100);
    const lin = parseFloat(el("iLin").value), kwh = parseFloat(el("iKwh").value);
    const costed = lin > 0 && kwh > 0;
    const hrs = parseFloat(el("iHrs").value) || 168;
    const capV = parseFloat(el("iCap").value) || 0;
    const flags = [...el("pbRail").querySelectorAll("li")].map(li => li.textContent.replace(/\s+/g, " ").trim());

    body = `
      <div class="ps-key">
        <div><span>Recommended unit</span><strong>Type ${s.type}</strong></div>
        <div><span>Part number</span><strong>${PART[s.type]}</strong></div>
        <div><span>Indicative price</span><strong>${money(s.price)}</strong></div>
        <div><span>Payback</span><strong>${costed ? txt("sPB") : "Not costed"}</strong></div>
      </div>
      <div class="ps-grid">
        <div class="ps-block"><h2>Requirement</h2><table class="ps-table">
          ${row("N2 purity", s.purity + "%")}
          ${row("N2 flow", `${num(s.flow)} scfm <small>${m3h(s.flow)}</small>`)}
          ${row("Feed air pressure", `${s.psi} psig <small>${barg(s.psi)}</small>`)}
          ${row("Feed air supplied by", s.cust ? "Customer's existing plant air" : "PCI (compressor included)")}
        </table></div>
        <div class="ps-block"><h2>Selection</h2><table class="ps-table">
          ${row("Unit", `NGU Type-X Type ${s.type} <small>${s.type} membranes</small>`)}
          ${row("Rated N2 output", `${num(out)} scfm <small>${m3h(out)} &middot; ${num(out - s.flow)} scfm headroom</small>`)}
          ${row("Feed air required", `${num(s.air)} scfm <small>${m3h(s.air)} &middot; air factor ${AF[s.psi][s.purity]}&times;</small>`)}
          ${row("Compressor", s.cust ? "By customer" : `Elgi ${s.comp.kw} kW <small>${s.comp.label || num(s.comp.scfm)} scfm</small>`)}
          ${row("N2 delivery pressure", `about ${Math.round(dlv(s.psi))} psig <small>${barg(dlv(s.psi))}</small>`)}
        </table></div>
        <div class="ps-block"><h2>Indicative price</h2><table class="ps-table">
          ${row("Scope", s.cust ? "NGU only, no compressor" : "NGU + feed air compressor")}
          ${row("List price", `${money(s.price)} <small>at ${gp}% GP</small>`)}
          ${row("Excludes", "Freight, installation, piping, electrical, options")}
        </table></div>
        <div class="ps-block"><h2>Payback vs delivered LIN</h2><table class="ps-table">
          ${costed ? `
          ${row("Annual LIN spend", money(lin))}
          ${row("Electricity", "$" + kwh + "/kWh")}
          ${row("Operating hours", hrs + " h/week")}
          ${row("Capital used", money(capV))}
          ${row("Connected load", txt("sKw") + ` <small>${txt("sKwSub")}</small>`)}
          ${row("Annual NGU cost", txt("sNC") + " <small>power + maintenance</small>")}
          ${row("Annual saving", txt("sAS") + ` <small>${txt("sASSub")}</small>`)}
          ${row("Payback", txt("sPB") + ` <small>${txt("sS7")}</small>`)}`
          : row("Not costed", "Enter the customer's annual LIN spend and electricity rate on tab 2.")}
        </table></div>
      </div>
      ${(s.cust || (costed && flags.length)) ? `<div class="ps-notes">
        ${s.cust ? `<p>${custAirNote(s).replace(/\s+/g, " ")}</p>` : ""}
        ${costed ? flags.map(f => `<p>${esc(f)}</p>`).join("") : ""}
      </div>` : ""}`;
  }

  el("printSheet").innerHTML = `
    <div class="ps-head">
      ${logo ? `<img src="${logo}" alt="PCI Gases">` : ""}
      <div class="ps-title"><h1>NGU Type-X Spec Sheet</h1>
        <p>${rep ? "Prepared by " + esc(rep) + " &middot; " : ""}${date}</p></div>
    </div>
    <p class="ps-project">${esc(name)}</p>
    ${body}
    <p class="ps-foot">Indicative projection for sizing and conversation &mdash; not a quotation or a performance guarantee.
      Performance projected from the Evonik SEPURAN&reg; N2 sizing tool v12.07 for the 6&Prime; system (150&times;1310) at
      125 &deg;F / 51.7 &deg;C membrane inlet. Price is the pricing model's list figure and excludes freight, installation,
      piping and electrical. Payback is simple and undiscounted; NGU running cost is power plus maintenance at 4% of capital.
      Confirm with engineering before quoting. 1 scfm = 1.699 m&sup3;/h &middot; 1 psi = 0.0689 bar.
      NGU Type-X Sales Toolkit v${VER}.</p>`;
}
window.addEventListener("beforeprint", buildPrintSheet);
el("projPrint").addEventListener("click", () => { buildPrintSheet(); window.print(); });

</script></body></html>''')

open(dst, "w", encoding="utf-8").write(html)
print("ok", len(html))
