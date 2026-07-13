#!/usr/bin/env node
// PreToolUse command rewriter: transparently routes dev commands through rtk
// so terminal output enters the context compressed (60–90% fewer tokens).
// Dialect comes in as argv[2] — hosts speak different hook wire formats.
// Strictly fail-open: never rewrite when rtk is absent (a missing binary
// would fail the command), never touch compound/bypassed commands.

import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import {
  runHook,
  commandLineOf,
  toolInputOf,
  denyResponse,
  SILENT,
  ALLOW,
} from "./lib/io.mjs";
import { rewriteCommand } from "./lib/policy.mjs";

// Hosts whose PreToolUse contract cannot mutate the command and requires an
// explicit decision (a bare {} is treated as deny). For these we deny-nudge on
// a rewrite and must return an explicit allow on every no-op. Mutating hosts
// (claude-code, codex) keep the silent updatedInput rewrite and a {} no-op.
const DECISION_HOSTS = new Set(["antigravity", "grok"]);
const allowFor = (dialect) => (DECISION_HOSTS.has(dialect) ? ALLOW : SILENT);

let rtkProbe = null;
export function rtkAvailable(env = process.env) {
  // Test override so the suite doesn't depend on the machine's PATH.
  if (env.SCROOGE_TEST_RTK === "1") return true;
  if (env.SCROOGE_TEST_RTK === "0") return false;
  if (rtkProbe !== null) return rtkProbe;
  try {
    execFileSync(process.platform === "win32" ? "where" : "which", ["rtk"], {
      stdio: "ignore",
      timeout: 2000,
    });
    rtkProbe = true;
  } catch {
    rtkProbe = false;
  }
  return rtkProbe;
}

export function handle(input, dialect, env = process.env) {
  const cmd = commandLineOf(input);
  const rewritten = rtkAvailable(env) ? rewriteCommand(cmd, env) : null;
  // No-op must be an explicit allow on decision hosts — a bare {} reads as deny.
  if (!rewritten) return allowFor(dialect);

  // Antigravity and Grok can deny but not mutate args — nudge with the exact
  // command to run instead. (Their contract has no slot for a replacement.)
  if (DECISION_HOSTS.has(dialect)) {
    return denyResponse(
      `[scrooge-kit] Run this through rtk to compress the output: \`${rewritten}\`. To intentionally run raw, prefix with SCROOGE_RAW=1.`,
    );
  }
  // Claude Code dialect; Codex follows the same hookSpecificOutput shape and
  // silently rewrites the command via updatedInput.
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "allow",
      permissionDecisionReason: "scrooge-kit: routed through rtk",
      updatedInput: { ...toolInputOf(input), command: rewritten },
    },
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const dialect = process.argv[2] ?? "claude-code";
  // Dialect-aware fallback: an internal error / empty stdin must still allow
  // explicitly on decision hosts, never emit a bare {} that reads as deny.
  runHook((input) => handle(input, dialect), allowFor(dialect));
}
