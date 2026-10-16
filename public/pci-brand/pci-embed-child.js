/* pci-embed-child.js: include in an app that is iframed on pcigases.com.
   1. Reports the app's height to the parent page so the iframe has no inner scrollbar.
   2. Forwards analytics events to the parent page, where GTM and the cookie banner live.
   Pairs with templates/embed-snippet.html (the parent side). No dependencies.

   Usage (plain):  <script src="pci-brand/pci-embed-child.js" defer></script>
   Usage (ESM):    import "./pci-brand/pci-embed-child.js";
   Events:         window.PCIEmbed.track("pci_tool_result", { tool: "lp2lp-calculator" });
*/
(function () {
  "use strict";
  if (typeof window === "undefined") return;
  var cs = document.currentScript;
  // Pages allowed to receive height and events. Override for local testing only:
  // <script src="pci-embed-child.js" data-parent-origins="http://localhost:5173">
  var PARENT_ORIGINS = (cs && cs.dataset.parentOrigins ? cs.dataset.parentOrigins.split(/[\s,]+/) : null) ||
                       ["https://www.pcigases.com", "https://pcigases.com"];
  var inFrame = window.parent && window.parent !== window;
  var id = (cs && cs.dataset.embedId) ||
           new URLSearchParams(location.search).get("embed") || "pci-app";

  function post(msg) {
    if (!inFrame) return;
    msg.source = "pci-app"; msg.id = id;
    // Target each allowed origin; postMessage drops the message when the origin does not match.
    PARENT_ORIGINS.forEach(function (o) { try { window.parent.postMessage(msg, o); } catch (e) {} });
  }

  var last = 0;
  function sendHeight() {
    var h = Math.ceil(document.documentElement.getBoundingClientRect().height);
    if (Math.abs(h - last) > 1) { last = h; post({ type: "pci:height", height: h }); }
  }
  if (inFrame) {
    document.documentElement.classList.add("pci-embedded");
    if ("ResizeObserver" in window) new ResizeObserver(sendHeight).observe(document.documentElement);
    window.addEventListener("load", sendHeight);
    sendHeight();
  }

  window.PCIEmbed = {
    inFrame: inFrame,
    /** Analytics event. In a frame the parent pushes it to its dataLayer (after consent);
        standalone it goes to this page's own dataLayer if one exists. */
    track: function (event, params) {
      var payload = Object.assign({ event: event }, params || {});
      if (inFrame) post({ type: "pci:event", payload: payload });
      else if (window.dataLayer) window.dataLayer.push(payload);
    },
    resize: sendHeight,
  };
})();
