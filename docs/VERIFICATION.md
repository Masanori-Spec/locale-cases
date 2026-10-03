# Verification status

## Local core evidence

- Node 24.19.0 / V8 13.6.233.17-node.51 / ICU 78.3 / CLDR 48.0 / Unicode 17.0
- 69 tests passed: 49 core/CLI/independent-oracle tests plus 20 UI lifecycle tests
- Independent marker-based oracle executes the pinned formatter across 20 seeded randomized catalogs × en/ja/ar/ru, compares exhaustive original-domain union with reduced fixtures, checks exact per-case branch IDs and replays all rendered strings
- Fixtures exercise English exact/one/other; Japanese unobserved one; Arabic six categories; Russian fractional other; ordinals; exact priority; offsets and pound substitution; nested shared arguments; sibling selectors; apostrophe escaping; prototype-like message/option keys; HTML and bidi samples; malformed values and all-or-nothing budgets
- CLI verifies source preservation, overwrite refusal, no artifacts on validation/work failure and flag rejection
- Independent review found and verified fixes for malformed UTF-16 path encoding, domain planning outside the work budget/quadratic repetition, and branch-path metadata amplification before output limits

## Browser and CI boundary

The local environment restricts Chromium sandbox setup. No local browser launch or sandbox bypass was attempted. Thirteen browser scenarios are defined for a sandbox-capable machine, with `chromiumSandbox: true`, including real workers, cancel/edit invalidation, stale replies, errors/recovery, downloads, English/Japanese, mobile layouts, safe hostile text and skip-link focus.

**Remote CI and screenshot inspection are pending publication.** A browser test definition is not a passing browser result. The parent publication step must record the exact remote commit/run and inspect artifact screenshots before marking browser verification complete.

CI pins ubuntu-22.04 because Chromium sandboxing is usable there; its announced retirement is April 17, 2027. Recheck runner availability and migrate before that date. No `--no-sandbox`, AppArmor changes or security-policy relaxation is used.

## Synthetic benchmark

`docs/benchmark.json` records five local samples/scenario with runtime metadata. On this runner, the 50-message/four-locale scenario produced 800 fixtures from 1,950 representative vectors with median ~57 ms; the 4,096-vector scenario produced 8 fixtures with median ~11 ms. These measurements are synthetic and omit browser rendering; they are not an SLA or evidence of customer demand.

The checked-in `fixtures/expected/` outputs are a reproducible example from the recorded Node runtime, not a cross-runtime golden guarantee. Their catalog uses English text for every locale to expose selector behavior; it is not a translated catalog.
