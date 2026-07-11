import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { copyDir, execStep, readJson, removeDir, writeJson } from "../core/fsutil.mjs";
import { binaryAvailable } from "../core/detect.mjs";
import { CCUSAGE_STATUSLINE } from "../core/tools/ccusage.mjs";
import {
  addClaudeStyleHook,
  removeClaudeStyleHooks,
  rewriterCommand,
} from "./shared.mjs";

// Claude Code: PreToolUse hook rewrites Bash commands to `rtk <cmd>`
// (documented hookSpecificOutput.updatedInput), skill goes to ~/.claude/skills,
// headroom MCP is registered through the `claude mcp` CLI (safer than editing
// ~/.claude.json, which holds live session state).

function settingsFile(home) {
  return join(home, ".claude", "settings.json");
}

export function install(ctx) {
  const { home, journal, payloadDir, opts, log } = ctx;
  const file = settingsFile(home);
  let settings = readJson(file, {});

  const hook = addClaudeStyleHook(
    settings,
    "PreToolUse",
    "Bash",
    rewriterCommand(payloadDir, "claude-code"),
  );
  settings = hook.settings;
  let changed = hook.changed;

  if (opts.statusline && !settings.statusLine) {
    settings = { ...settings, statusLine: CCUSAGE_STATUSLINE };
    changed = true;
  }
  if (changed) writeJson(journal, file, settings);

  copyDir(
    journal,
    join(payloadDir, "skills", "scrooge-hygiene"),
    join(home, ".claude", "skills", "scrooge-hygiene"),
  );

  // `claude mcp` writes to the real user config regardless of --home; only
  // exec it when we are actually installing for this machine's user.
  if (ctx.headroomAvailable && home === homedir() && binaryAvailable("claude")) {
    execStep(journal, "claude mcp add --scope user headroom -- headroom mcp serve", () => {
      try {
        execSync("claude mcp add --scope user headroom -- headroom mcp serve", {
          stdio: "pipe",
        });
      } catch (err) {
        // Already registered is fine; anything else is worth a note.
        const msg = String(err?.stderr ?? err);
        if (!/already exists/i.test(msg)) log(`claude-code: mcp add failed — register manually: claude mcp add --scope user headroom -- headroom mcp serve`);
      }
    });
  } else if (ctx.headroomAvailable) {
    log("claude-code: `claude` binary not found — register headroom manually: claude mcp add --scope user headroom -- headroom mcp serve");
  }
}

export function uninstall(ctx) {
  const { home, journal } = ctx;
  const file = settingsFile(home);
  let settings = readJson(file, null);
  if (settings) {
    const res = removeClaudeStyleHooks(settings, "PreToolUse");
    settings = res.settings;
    let changed = res.changed;
    // Only remove the statusline if it is exactly the one we installed.
    if (JSON.stringify(settings.statusLine) === JSON.stringify(CCUSAGE_STATUSLINE)) {
      settings = { ...settings };
      delete settings.statusLine;
      changed = true;
    }
    if (changed) writeJson(journal, file, settings);
  }
  removeDir(journal, join(home, ".claude", "skills", "scrooge-hygiene"));
  if (home === homedir() && binaryAvailable("claude")) {
    execStep(journal, "claude mcp remove --scope user headroom", () => {
      try {
        execSync("claude mcp remove --scope user headroom", { stdio: "pipe" });
      } catch {
        // Not registered — nothing to do.
      }
    });
  }
}

export function verify(ctx) {
  const { home } = ctx;
  const checks = [];
  const settings = readJson(settingsFile(home), {});
  checks.push({
    name: "hook registered (PreToolUse)",
    pass: JSON.stringify(settings.hooks?.PreToolUse ?? "").includes("scrooge-kit"),
  });
  checks.push({
    name: "skill installed",
    pass: existsSync(join(home, ".claude", "skills", "scrooge-hygiene", "SKILL.md")),
  });
  return checks;
}
