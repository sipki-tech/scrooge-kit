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
} from "./lib/io.mjs";
import { rewriteCommand } from "./lib/policy.mjs";

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
  if (!rewritten) return SILENT;

  switch (dialect) {
    // Antigravity hooks can deny but not (verifiably) mutate args — nudge
    // with the exact command to run instead.
    case "antigravity":
      return denyResponse(
        `[scrooge-kit] Run this through rtk to compress the output: \`${rewritten}\`. To intentionally run raw, prefix with SCROOGE_RAW=1.`,
      );
    // Cursor beforeShellExecution can only gate/annotate, not rewrite.
    case "cursor":
      return {
        permission: "allow",
        agent_message: `[scrooge-kit] Prefer \`${rewritten}\` — rtk compresses the output. Prefix with SCROOGE_RAW=1 to skip.`,
      };
    // Claude Code dialect; Gemini CLI, Codex and Grok follow the same
    // hookSpecificOutput shape (documented for Claude, best-effort mirrors
    // elsewhere — a host that ignores it simply runs the original command).
    default:
      return {
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "allow",
          permissionDecisionReason: "scrooge-kit: routed through rtk",
          updatedInput: { ...toolInputOf(input), command: rewritten },
        },
      };
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const dialect = process.argv[2] ?? "claude-code";
  runHook((input) => handle(input, dialect));
}
