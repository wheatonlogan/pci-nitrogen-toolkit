## PCI Gases brand (managed by the pci-web-app skill)
This app uses the PCI brand kit in `public/pci-brand/`. Read `public/pci-brand/BRAND.md` before any UI work.
Don't edit that folder; refresh it with the pci-web-app skill (`scaffold.mjs --update`).

## Working on the toolkit
- `public/toolkit.html` is now the source of truth. `scripts/hostify.py` records the one-time conversion from the offline v1.6 file; don't re-run it over later edits.
- Run `npm test` (needs `TEST_DATABASE_URL`) before pushing. The browser tests cover the model, payback, projects, the sizing log and the printed sheet.
- Model numbers are unconfirmed in places (135 vs 175 psig spec basis, 360 vs 450 scfm ceiling, 125 vs 100 °F, module dP). See the project roadmap before changing them.
