import { join } from "node:path";
import { readJson, writeJson } from "../core/fsutil.mjs";
import { headroomEntry, mergeMcpServers, pruneMcpServers } from "../core/mcp-merge.mjs";
import {
  addClaudeStyleHook,
  removeClaudeStyleHooks,
  rewriterCommand,
} from "./shared.mjs";

// Grok CLI: lifecycle hooks follow the Claude Code pattern (JSON over
// stdin/stdout) and MCP servers live in .grok/settings.json. Best-effort:
// a build that ignores hookSpecificOutput just runs the original command.

function settingsFile(home) {
  return join(home, ".grok", "settings.json");
}

export function install(ctx) {
  const { home, journal, payloadDir } = ctx;
  const file = settingsFile(home);
  let settings = readJson(file, {});
  const hook = addClaudeStyleHook(
    settings,
    "PreToolUse",
    "Bash",
    rewriterCommand(payloadDir, "grok"),
  );
  if (hook.changed) writeJson(journal, file, hook.settings);
  mergeMcpServers(journal, file, { headroom: headroomEntry(ctx.headroomAvailable) });
}

export function uninstall(ctx) {
  const { home, journal } = ctx;
  const file = settingsFile(home);
  const settings = readJson(file, null);
  if (settings) {
    const res = removeClaudeStyleHooks(settings, "PreToolUse");
    if (res.changed) writeJson(journal, file, res.settings);
  }
  pruneMcpServers(journal, file, { headroom: headroomEntry(false) });
}

export function verify(ctx) {
  const settings = readJson(settingsFile(ctx.home), {});
  return [
    {
      name: "hook registered (PreToolUse)",
      pass: JSON.stringify(settings.hooks?.PreToolUse ?? "").includes("scrooge-kit"),
    },
  ];
}
