import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { handle } from "../shared/scripts/rtk-rewriter.mjs";
import { ALLOW } from "../shared/scripts/lib/io.mjs";

const SCRIPT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "shared",
  "scripts",
  "rtk-rewriter.mjs",
);

const RTK_ON = { SCROOGE_TEST_RTK: "1" };
const RTK_OFF = { SCROOGE_TEST_RTK: "0" };

function runScript(dialect, input, env) {
  const out = execFileSync(process.execPath, [SCRIPT, dialect], {
    input: JSON.stringify(input),
    env: { ...process.env, ...env },
    timeout: 10000,
  });
  return JSON.parse(out.toString());
}

// --- Mutating hosts (claude-code, codex): silent updatedInput rewrite ---

test("claude-code dialect rewrites via updatedInput", () => {
  const res = handle(
    { tool_name: "Bash", tool_input: { command: "git status", description: "x" } },
    "claude-code",
    RTK_ON,
  );
  assert.equal(res.hookSpecificOutput.permissionDecision, "allow");
  assert.equal(res.hookSpecificOutput.updatedInput.command, "rtk git status");
  assert.equal(res.hookSpecificOutput.updatedInput.description, "x");
});

test("mutating host no-op is a bare {}", () => {
  for (const dialect of ["claude-code", "codex"]) {
    // rtk unavailable → no rewrite
    assert.deepEqual(handle({ tool_input: { command: "git status" } }, dialect, RTK_OFF), {});
    // non-dev command → no rewrite
    assert.deepEqual(handle({ tool_input: { command: "ls -la" } }, dialect, RTK_ON), {});
  }
});

// --- Decision hosts (antigravity, grok): deny-nudge on rewrite, explicit allow on no-op ---

test("antigravity dialect denies with suggestion", () => {
  const res = handle(
    { toolCall: { args: { CommandLine: "npm test" } } },
    "antigravity",
    RTK_ON,
  );
  assert.equal(res.decision, "deny");
  assert.match(res.reason, /rtk npm test/);
  assert.equal(res.allow_tool, false);
});

test("grok dialect denies with suggestion (camelCase toolInput)", () => {
  const res = handle(
    { toolName: "run_terminal_command", toolInput: { command: "npm test" } },
    "grok",
    RTK_ON,
  );
  assert.equal(res.decision, "deny");
  assert.match(res.reason, /rtk npm test/);
});

test("decision-host no-op is an explicit allow, never a bare {}", () => {
  for (const dialect of ["antigravity", "grok"]) {
    // non-dev command
    assert.deepEqual(handle({ tool_input: { command: "ls -la" } }, dialect, RTK_ON), ALLOW);
    // rtk unavailable
    assert.deepEqual(handle({ tool_input: { command: "git status" } }, dialect, RTK_OFF), ALLOW);
  }
});

// --- e2e: fail-open shape is dialect-aware ---

test("e2e: script reads stdin, writes JSON, exits 0", () => {
  const res = runScript(
    "claude-code",
    { tool_name: "Bash", tool_input: { command: "git status" } },
    RTK_ON,
  );
  assert.equal(res.hookSpecificOutput.updatedInput.command, "rtk git status");
});

test("e2e: mutating host fail-open on garbage stdin is {}", () => {
  const out = execFileSync(process.execPath, [SCRIPT, "claude-code"], {
    input: "this is not json {{{",
    env: { ...process.env, ...RTK_ON },
    timeout: 10000,
  });
  assert.deepEqual(JSON.parse(out.toString()), {});
});

test("e2e: mutating host fail-open on empty stdin is {}", () => {
  const res = runScript("claude-code", {}, RTK_ON);
  assert.deepEqual(res, {});
});

test("e2e: decision host fail-open is an explicit allow", () => {
  // garbage stdin exercises the dialect-aware runHook fallback
  const garbage = execFileSync(process.execPath, [SCRIPT, "antigravity"], {
    input: "this is not json {{{",
    env: { ...process.env, ...RTK_ON },
    timeout: 10000,
  });
  assert.deepEqual(JSON.parse(garbage.toString()), ALLOW);
  // empty stdin flows through the no-op path
  assert.deepEqual(runScript("grok", {}, RTK_ON), ALLOW);
});
