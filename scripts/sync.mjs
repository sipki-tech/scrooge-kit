#!/usr/bin/env node
// Distributes shared/ (the single source of truth) into every plugin.
// Copies are COMMITTED so each plugin installs natively with no build step.
// Usage: node scripts/sync.mjs          — write copies
//        node scripts/sync.mjs --check  — exit 1 if any copy is stale (used by tests/CI)

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const SCRIPT_PLUGINS = ["claude-code", "codex", "antigravity", "grok"];
const SKILL_PLUGINS = ["claude-code", "codex", "antigravity", "grok"];

const rules = readFileSync(join(ROOT, "shared", "rules", "token-hygiene.md"), "utf8");

// target path (relative to repo root) -> desired content source
const FILE_TARGETS = {
  "plugins/antigravity/rules/token-hygiene.md": rules,
};

const DIR_TARGETS = [
  ...SCRIPT_PLUGINS.map((p) => ({ src: "shared/scripts", dest: `plugins/${p}/scripts` })),
  ...SKILL_PLUGINS.map((p) => ({ src: "shared/skills", dest: `plugins/${p}/skills` })),
  { src: "shared/scripts/lib", dest: "plugins/opencode/lib" },
];

function listFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...listFiles(p));
    else out.push(p);
  }
  return out;
}

const check = process.argv.includes("--check");
const stale = [];

for (const { src, dest } of DIR_TARGETS) {
  const srcAbs = join(ROOT, src);
  const destAbs = join(ROOT, dest);
  if (check) {
    for (const file of listFiles(srcAbs)) {
      const target = join(destAbs, relative(srcAbs, file));
      if (!existsSync(target) || readFileSync(target, "utf8") !== readFileSync(file, "utf8")) {
        stale.push(relative(ROOT, target));
      }
    }
  } else {
    rmSync(destAbs, { recursive: true, force: true });
    mkdirSync(dirname(destAbs), { recursive: true });
    cpSync(srcAbs, destAbs, { recursive: true });
  }
}

for (const [target, content] of Object.entries(FILE_TARGETS)) {
  const abs = join(ROOT, target);
  if (check) {
    if (!existsSync(abs) || readFileSync(abs, "utf8") !== content) stale.push(target);
  } else {
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
}

if (check) {
  if (stale.length) {
    console.error("stale copies (run `node scripts/sync.mjs`):\n  " + stale.join("\n  "));
    process.exit(1);
  }
  console.log("sync: all plugin copies match shared/");
} else {
  console.log(`sync: ${DIR_TARGETS.length} dirs + ${Object.keys(FILE_TARGETS).length} files distributed`);
}
