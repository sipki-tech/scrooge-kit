#!/usr/bin/env node
// Packs plugins/gemini-cli into the release archive Gemini CLI expects:
// the tar.gz must contain the extension CONTENTS at archive root
// (gemini-extension.json at top level), per docs/extensions/releasing.md.
// Usage: node scripts/pack-gemini.mjs [outDir]   (default: dist/)

import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(ROOT, process.argv[2] ?? "dist");
mkdirSync(outDir, { recursive: true });

const out = join(outDir, "scrooge-kit.gemini-extension.tar.gz");
execFileSync("tar", ["-czf", out, "-C", join(ROOT, "plugins", "gemini-cli"), "."], {
  stdio: "inherit",
});
console.log(`packed: ${out}`);
