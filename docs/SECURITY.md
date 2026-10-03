# Security and limits

Catalog/config contents are untrusted data. No `eval`, executable config, custom formatter callbacks, dynamic imports from inputs, runtime fetches, uploads, analytics, third-party fonts or persistent storage are used. The browser renders all source IDs, arguments, text and errors as text nodes. Bidirectional text is retained as data and isolated in display containers; inspect its escaped JSON when auditing deceptive text.

The local server serves only `web/`, binds to 127.0.0.1 and accepts GET/HEAD only. Its CSP disallows connections, plugins, forms and foreign scripts. Do not expose this development server to a network or place secrets/symlinks in the served folder. The browser workbench has no authentication/server-side input-processing feature.

Prototype-related **argument names** are rejected before passing them to dependencies. Message IDs and select-option labels remain supported data; maps/null-prototype objects and own-property access prevent accidental prototype lookups. JSON duplicate keys are rejected, including escaped-equivalent keys. Invalid UTF-16 is rejected before branch path encoding.

Inputs, identifiers, values, recursion, AST elements/arms, finite-domain products, computational work, rendered expansion, static branch metadata and accumulated exports are bounded. Finite fractions are allowed; values beyond the safe integer magnitude are rejected. These limits are defense in depth, not hard process isolation. Browser cancellation terminates a disposable worker; stale messages from an old worker are ignored.

An error invalidates browser exports. CLI validation and calculation errors do not create an output directory; existing files/directories are never overwritten. Normal write errors are cleaned up. A crash/power-loss atomic commit for two separate output files is not promised. Run the CLI on input/output locations you control; hostile concurrent filesystem mutation is outside its contract.

No account, key, license grant, public deployment or university-system access is part of this software. Never use generated expected strings as evidence that translations are safe or accurate for medical, legal or other consequential content.
