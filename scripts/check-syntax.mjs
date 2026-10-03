import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
for (const dir of ["src", "scripts", "web", "test"])
  for (const file of await readdir(dir)) {
    if (!/\.(?:m?js|cjs)$/.test(file)) continue;
    const r = spawnSync(process.execPath, ["--check", `${dir}/${file}`], {
      stdio: "inherit",
    });
    if (r.status !== 0) process.exit(r.status || 1);
  }
