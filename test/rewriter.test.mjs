import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { handle } from "../payload/scripts/rtk-rewriter.mjs";

const SCRIPT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "payload",
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

test("no rewrite when rtk is unavailable", () => {
  const res = handle(
    { tool_name: "Bash", tool_input: { command: "git status" } },
    "claude-code",
    RTK_OFF,
  );
  assert.deepEqual(res, {});
});

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

test("cursor dialect allows with agent_message", () => {
  const res = handle({ command: "git diff" }, "cursor", RTK_ON);
  assert.equal(res.permission, "allow");
  assert.match(res.agent_message, /rtk git diff/);
});

test("non-dev command is silent in every dialect", () => {
  for (const dialect of ["claude-code", "antigravity", "cursor"]) {
    assert.deepEqual(handle({ tool_input: { command: "ls -la" } }, dialect, RTK_ON), {});
  }
});

test("e2e: script reads stdin, writes JSON, exits 0", () => {
  const res = runScript(
    "claude-code",
    { tool_name: "Bash", tool_input: { command: "git status" } },
    RTK_ON,
  );
  assert.equal(res.hookSpecificOutput.updatedInput.command, "rtk git status");
});

test("e2e: fail-open on garbage stdin", () => {
  const out = execFileSync(process.execPath, [SCRIPT, "claude-code"], {
    input: "this is not json {{{",
    env: { ...process.env, ...RTK_ON },
    timeout: 10000,
  });
  assert.deepEqual(JSON.parse(out.toString()), {});
});

test("e2e: fail-open on empty stdin", () => {
  const res = runScript("claude-code", {}, RTK_ON);
  assert.deepEqual(res, {});
});
