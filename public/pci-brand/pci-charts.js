/* ============================================================================
   pci-charts.js  v1.0 — PCI Gases chart theme for Chart.js 4.x
   Depends on: assets/css/pci-brand.css (reads its custom properties)
   Load AFTER chart.umd.js and after the stylesheet.

   Usage:
     PCIChart.init();                                  // once, on DOMContentLoaded
     const c = PCIChart.line(ctx, { labels, datasets });
     PCIChart.onThemeChange(() => c.update());         // keeps dark mode honest

   Rules this file enforces so you don't have to remember them:
     - series colors come from --series-1..5 in fixed order, never cycled
     - 2px lines, >=8px hover markers, thin bars with 4px rounded data-ends
     - 2px surface gap between stacked segments and adjacent bars
     - recessive grid/axes, no dual y-axis, legend on for >=2 series
     - text wears ink tokens, never the series color
   ========================================================================== */
(function (global) {
  "use strict";

  const cssVar = (name, fallback) => {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  };

  /** Fixed categorical order. NEVER cycle past the cap — fold to "Other" or facet. */
  const THEME_DEFAULT  = ["--series-1", "--series-2", "--series-3", "--series-4"];              // max 4
  const THEME_EXTENDED = ["--series-x1","--series-x2","--series-x3","--series-x4","--series-x5"]; // exactly 5
  let SERIES_ORDER = THEME_DEFAULT;
  let CAP_ADJACENT = 4;     // bars, lines, stacks (validated adjacent pairlist)
  const CAP_ALLPAIRS = 3;   // scatter, bubble, map, small multiples

  /** Switch themes ONCE, before the first chart. Never mid-surface. */
  function useTheme(name) {
    if (name !== "default" && name !== "extended") throw new Error('PCIChart.useTheme: "default" | "extended"');
    SERIES_ORDER = name === "extended" ? THEME_EXTENDED : THEME_DEFAULT;
    CAP_ADJACENT = name === "extended" ? 5 : 4;
    readTokens();
  }

  const T = {};   // live token cache

  function readTokens() {
    T.surface   = cssVar("--chart-surface", "#FFFFFF");
    T.grid      = cssVar("--chart-grid", "#E3E3E6");
    T.axis      = cssVar("--chart-axis", "#9A9AA0");
    T.ink       = cssVar("--ink-primary", "#000000");
    T.ink2      = cssVar("--ink-secondary", "#424242");
    T.inkMuted  = cssVar("--ink-muted", "#6B6B6B");
    T.fontBody  = cssVar("--font-body", "Roboto, Helvetica, Arial, sans-serif");
    const FB = { "--series-1":"#1e48e8","--series-2":"#e27907","--series-3":"#089ee0","--series-4":"#fd5106",
                 "--series-x1":"#cc8507","--series-x2":"#1e48e8","--series-x3":"#e27907","--series-x4":"#089ee0","--series-x5":"#fd5106" };
    T.series    = SERIES_ORDER.map(n => cssVar(n, FB[n]));
    T.status    = {
      good:     cssVar("--status-good", "#05893f"),
      warning:  cssVar("--status-warning", "#ba7905"),
      serious:  cssVar("--status-serious", "#ae5c04"),
      critical: cssVar("--status-critical", "#b53703"),
    };
    T.seq = [100,200,300,400,500,600,700].map(s => cssVar("--seq-" + s, "#2c5cfc"));
    return T;
  }

  /** Color for slot i (0-based). Throws past the cap rather than inventing a hue. */
  const ALL_PAIRS_FORMS = ["scatter", "bubble", "map", "smallmultiples"];
  function series(i, form) {
    const allPairs = ALL_PAIRS_FORMS.includes(form);
    if (allPairs && SERIES_ORDER !== THEME_DEFAULT) {
      throw new Error(
        'PCIChart: scatter / bubble / map / small-multiples charts must use the DEFAULT theme ' +
        '(its first three slots are the only PCI combination validated on the all-pairs pairlist). ' +
        'Call PCIChart.useTheme("default") for this surface, or change chart form.'
      );
    }
    const cap = allPairs ? CAP_ALLPAIRS : CAP_ADJACENT;
    if (i >= cap) {
      throw new Error(
        `PCIChart: series slot ${i + 1} exceeds the validated PCI cap of ${cap} for "${form || "bar/line"}" charts. ` +
        `Fold the remainder into "Other", facet into small multiples, or change chart form — do not add a hue.`
      );
    }
    return T.series[i];
  }

  function init() {
    readTokens();
    if (!global.Chart) return T;
    const C = global.Chart;
    C.defaults.font.family = T.fontBody;
    C.defaults.font.size = 12;
    C.defaults.color = T.ink2;
    C.defaults.borderColor = T.grid;
    C.defaults.maintainAspectRatio = false;
    C.defaults.plugins.legend.labels.usePointStyle = false;  // solid 22x3 chip, per the mark spec
    C.defaults.plugins.legend.labels.padding = 16;
    C.defaults.plugins.legend.labels.boxWidth = 22;
    C.defaults.plugins.legend.labels.boxHeight = 3;
    C.defaults.plugins.legend.labels.color = T.ink2;
    C.defaults.plugins.tooltip.backgroundColor = cssVar("--pci-cobalt-blue", "#192F92");
    C.defaults.plugins.tooltip.titleColor = "#FFFFFF";
    C.defaults.plugins.tooltip.bodyColor = "#FFFFFF";
    C.defaults.plugins.tooltip.cornerRadius = 3;
    C.defaults.plugins.tooltip.padding = 10;
    C.defaults.plugins.tooltip.displayColors = true;
    C.defaults.plugins.tooltip.boxWidth = 10;
    C.defaults.plugins.tooltip.boxHeight = 10;
    return T;
  }

  const axes = (opts = {}) => ({
    x: {
      grid: { display: false, drawBorder: false },
      border: { color: T.axis },
      ticks: { color: T.inkMuted, maxRotation: 0, autoSkipPadding: 12 },
      title: opts.xTitle ? { display: true, text: opts.xTitle, color: T.ink2 } : undefined,
    },
    y: {
      beginAtZero: opts.beginAtZero !== false,
      grid: { color: T.grid, drawBorder: false, drawTicks: false },
      border: { display: false },
      ticks: { color: T.inkMuted, padding: 8, callback: opts.yFormat || undefined },
      title: opts.yTitle ? { display: true, text: opts.yTitle, color: T.ink2 } : undefined,
    },
  });

  const common = (data, opts) => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },   // crosshair behaviour
    plugins: {
      legend: { display: (data.datasets || []).length >= 2, position: "top", align: "start" },
      tooltip: { enabled: true },
      title: { display: false },
    },
    scales: axes(opts),
  });

  /** Line / area. 2px strokes, hidden points that grow to 8px on hover. */
  function line(ctx, data, opts = {}) {
    const ds = data.datasets.map((d, i) => Object.assign({
      borderColor: d.borderColor || series(i, "line"),
      /* With fill:false Chart.js never paints backgroundColor on the plot, so setting
         it here only colours the legend chip — which is what gives a solid 22x3 swatch. */
      backgroundColor: d.backgroundColor || (opts.fill ? hexA(series(i, "line"), 0.14) : series(i, "line")),
      borderWidth: 2,
      pointRadius: 0,
      pointHoverRadius: 5,
      pointHitRadius: 18,
      pointBackgroundColor: d.borderColor || series(i, "line"),
      pointBorderColor: T.surface,
      pointBorderWidth: 2,          // 2px surface ring on overlapping marks
      tension: 0.25,
      fill: !!opts.fill,
    }, d));
    return new global.Chart(ctx, { type: "line", data: { labels: data.labels, datasets: ds }, options: common({ datasets: ds }, opts) });
  }

  /** Bar / stacked bar. Thin marks, 4px rounded data-end, 2px surface gap. */
  function bar(ctx, data, opts = {}) {
    const ds = data.datasets.map((d, i) => Object.assign({
      backgroundColor: d.backgroundColor || series(i, "bar"),
      borderColor: T.surface,
      borderWidth: opts.stacked ? { top: 2, right: 0, bottom: 0, left: 0 } : 0,
      borderRadius: { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 },
      borderSkipped: false,
      barPercentage: 0.62,
      categoryPercentage: 0.78,
      maxBarThickness: 52,
    }, d));
    const o = common({ datasets: ds }, opts);
    if (opts.stacked) { o.scales.x.stacked = true; o.scales.y.stacked = true; }
    o.interaction = { mode: "nearest", intersect: true };   // per-mark hover on bars
    return new global.Chart(ctx, { type: "bar", data: { labels: data.labels, datasets: ds }, options: o });
  }

  function hexA(hex, a) {
    const h = hex.replace("#", "");
    const n = parseInt(h.length === 3 ? h.split("").map(c => c + c).join("") : h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  /** Re-read tokens when the OS theme or the data-theme attribute changes. */
  function onThemeChange(cb) {
    const fire = () => { readTokens(); init(); cb && cb(T); };
    if (global.matchMedia) {
      const mq = global.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener ? mq.addEventListener("change", fire) : mq.addListener(fire);
    }
    new MutationObserver(fire).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  }

  global.PCIChart = { init, readTokens, series, line, bar, hexA, onThemeChange, useTheme, tokens: T,
                      get CAP_ADJACENT(){ return CAP_ADJACENT; }, CAP_ALLPAIRS,
                      get SERIES_ORDER(){ return SERIES_ORDER.slice(); } };
})(window);
