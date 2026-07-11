import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

// Every mutation goes through the journal so --dry-run can print the exact
// plan without touching the filesystem.
export function createJournal(dryRun) {
  const actions = [];
  return {
    actions,
    dryRun,
    record(type, target, apply) {
      actions.push({ type, target });
      if (!dryRun) apply();
    },
  };
}

export function copyDir(journal, from, to) {
  journal.record("copy", `${from} -> ${to}`, () => {
    mkdirSync(dirname(to), { recursive: true });
    cpSync(from, to, { recursive: true });
  });
}

export function removeDir(journal, target) {
  if (!existsSync(target)) return;
  journal.record("remove", target, () => {
    rmSync(target, { recursive: true, force: true });
  });
}

export function removeFile(journal, target) {
  if (!existsSync(target)) return;
  journal.record("remove", target, () => {
    rmSync(target, { force: true });
  });
}

export function readJson(file, fallback = null) {
  try {
    if (!existsSync(file)) return fallback;
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

export function writeJson(journal, file, data) {
  journal.record("write", file, () => {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
  });
}

export function readText(file, fallback = "") {
  try {
    if (!existsSync(file)) return fallback;
    return readFileSync(file, "utf8");
  } catch {
    return fallback;
  }
}

export function writeText(journal, file, text) {
  journal.record("write", file, () => {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  });
}

// Marker-delimited blocks let us append to files we do not own (config.toml,
// AGENTS.md, global_rules.md) and later remove exactly what we added, leaving
// every user edit outside the markers intact.
export const MARKER_BEGIN = "# >>> scrooge-kit >>>";
export const MARKER_END = "# <<< scrooge-kit <<<";

export function hasMarkerBlock(file) {
  return readText(file).includes(MARKER_BEGIN);
}

export function appendMarkerBlock(journal, file, body) {
  const current = readText(file);
  if (current.includes(MARKER_BEGIN)) return false;
  const sep = current.length && !current.endsWith("\n") ? "\n" : "";
  const block = `${sep}\n${MARKER_BEGIN}\n${body.trim()}\n${MARKER_END}\n`;
  journal.record("append", file, () => {
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, block);
  });
  return true;
}

export function removeMarkerBlock(journal, file) {
  const current = readText(file);
  if (!current.includes(MARKER_BEGIN)) return false;
  const re = new RegExp(`\\n?\\n?${escapeRe(MARKER_BEGIN)}[\\s\\S]*?${escapeRe(MARKER_END)}\\n?`, "g");
  const next = current.replace(re, "\n");
  journal.record("strip", file, () => {
    writeFileSync(file, next);
  });
  return true;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Shell/exec steps recorded in the same journal so --dry-run previews them.
export function execStep(journal, description, run) {
  journal.record("exec", description, run);
}
