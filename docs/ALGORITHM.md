# Algorithm and finite-domain contract

1. Decode bounded JSON with duplicate-key and malformed-Unicode rejection. Canonicalize explicitly supplied locales and check runtime support. Lower-only limits are immutable per run.
2. Preflight message size/raw brace depth. Parse with the pinned FormatJS parser. Walk the AST, reject unsupported nodes/types, count elements plus option arms and cap AST depth. Charge branch-descriptor/path metadata against the output budget before accumulating it.
3. Resolve one global argument type and selector-site list per name. Establish a visible finite domain from explicit values, one sample, or deterministic defaults. A plain reference sharing a typed name uses that same domain.
4. For every argument/locale, compute a selector signature: the option chosen at every syntactic selector site for that name. Exact keys use the runtime's literal `=${value}` lookup; no numeric normalization of keys such as `=01` is invented. Plural category selection uses `value - offset`. Keep the first domain value per signature. Cache this plan and charge signature operations to the work budget.
5. Preflight the product of representative counts without allocating its Cartesian product. Enumerate one vector at a time within message/locale and run budgets. One assignment is shared by all uses of an argument. Walk only selected branches; record their structural IDs.
6. Collapse identical trace vectors. Build an inverted branch-to-candidate index. Repeatedly choose the earliest candidate covering the largest number of still-uncovered observed arms. Scores are decremented incrementally. For a message with no branches, keep one concrete case. This deterministic greedy set cover is not a minimum solver.
7. Preflight each selected case's rendered byte upper bound, then render it through the pinned `IntlMessageFormat`. Add structured branch descriptors and unobserved arms, enforcing cumulative output limits before accumulation and serialization. No budget failure returns an export.

## Why signature reduction preserves this claim

All choices at all sites using an argument depend only on that argument value, site kind/options/offset and locale. Replacing a value with its signature-equivalent representative leaves every selector outcome unchanged. Consequently the complete Cartesian product of representatives preserves the union of branch arms observed in the complete original listed finite domain, including shared-name nesting constraints. It does not preserve all rendered texts: two numbers that both choose `other` can render different `#` values.

Coverage is aggregated independently per message and locale. It is arm coverage, not path coverage. Unobserved arms can require an omitted value, be irrelevant for the selected locale, be shadowed by exact selectors, or conflict with an ancestor's condition; the tool does not claim which explanation is a global proof.

## Structural IDs

A selector at root AST index 0 has path `root/0`. The selected `one` branch ID is `root/0:one`; a child at index 1 has a path such as `root/0/one/1`. Option labels are percent-encoded so delimiters cannot collide. IDs describe this parsed source's structure; editing a message may change them. Original message IDs remain data and may include prototype-like names.

## Ordering and runtime

Message IDs and canonical locale tags use deterministic code-unit ordering. Arguments use the same ordering. Domain order is first-occurrence order; default numeric values are ascending and default string keys are sorted. Greedy ties choose the earliest enumerated vector. There are no timestamps or random IDs in reports.

Node includes runtime versions; browser ICU/CLDR data is unknown. No polyfill downloads occur. Identical catalog/config input bytes and the same tool/runtime yield identical JSON bytes. Cross-runtime byte identity is explicitly outside the contract.

## Limits

Exported metadata contains every active limit. `vectorsPerMessage` applies per message/locale after signature reduction; `totalVectors` and `evaluatedVectors` refer to these representative vectors. Work units cover signature choices, candidate AST visits and greedy scoring/update operations, not every VM instruction. Input, AST, rendering and output caps bound remaining steps. Limits are operational safeguards, not a hard real-time or memory isolation guarantee. The browser worker can be terminated immediately by Cancel or input edits.
