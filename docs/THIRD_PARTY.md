# Third-party software

No project-wide license is added. Installing packages does not change their respective license terms.

Pinned production packages:
- @formatjs/icu-messageformat-parser 3.5.20 — BSD-3-Clause
- intl-messageformat 12.1.2 — BSD-3-Clause

Their transitive packages, exact resolved tarballs and integrity hashes are in package-lock.json. FormatJS implements the parser and formatter used here; Locale Cases adds finite-domain planning, tracing and fixture reduction.

Pinned development tools:
- esbuild 0.25.12 — MIT
- @playwright/test 1.56.0 — Apache-2.0
- prettier 3.6.2 — MIT

See each installed npm package's LICENSE/NOTICE files for complete terms and copyright notices. The browser build copies all four bundled production packages’ complete LICENSE.md texts into web/dist/THIRD_PARTY_LICENSES.txt and retains dependency legal comments when emitted by esbuild. These required notices are not a license grant for this project. Source archives omit node_modules and generated bundles; `npm ci --ignore-scripts && npm run build` rebuilds from the committed lockfile.
