# Prior art and intended difference

Sources reviewed 2026-10-03. This is a limited documentation survey, not a novelty or patent search and not evidence of market demand.

- [FormatJS CLI](https://formatjs.github.io/docs/tooling/cli/) already handles extraction/compilation, missing-key and structural verification, and pseudolocalization. Locale Cases reuses the ecosystem and does not present parsing or structural checks as new.
- [FormatJS ESLint plugin](https://formatjs.github.io/docs/tooling/linter/) already provides rules for plural categories and patterns including offsets or multiple plurals. Static authoring feedback is valuable alongside concrete fixtures.
- [ICU MessageFormat guide](https://unicode-org.github.io/icu/userguide/format_parse/messages/) explains argument selection, nested structures, exact-number branches, offsets and escaping. These semantics motivate test cases; they were not invented here.
- [FormatJS parser](https://formatjs.github.io/docs/icu-messageformat-parser/) supplies the AST. [Intl MessageFormat](https://formatjs.github.io/docs/intl-messageformat/) supplies rendered text and runtime locale behavior. Locale Cases deliberately shares their MF1 semantics rather than implementing another text formatter.

The proposed difference is a narrow workflow: generate concrete argument assignments, trace their actual nested branch choices, reduce them to compact starter fixtures, and export visible finite-domain coverage. The surveyed pages did not offer this exact end-to-end workflow. That observation is not proof that no other implementation exists.

Potential users are frontend developers preparing unit-test fixtures or Storybook examples for ICU catalogs. No customer interview, adoption measurement or paid-demand validation has been completed. There is no “first”, “novel algorithm”, “minimum test set”, “complete localization QA”, or linguistic-correctness claim.
