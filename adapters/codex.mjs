import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  appendMarkerBlock,
  copyDir,
  hasMarkerBlock,
  readText,
  removeDir,
  removeMarkerBlock,
} from "../core/fsutil.mjs";
import { rewriterCommand } from "./shared.mjs";

// Codex CLI: config.toml is the single config surface. We have zero deps and
// no TOML parser, so we only ever append/remove a marker-delimited block at
// the end of the file — user sections are never parsed or rewritten.

function configFile(home) {
  return join(home, ".codex", "config.toml");
}

function agentsFile(home) {
  return join(home, ".codex", "AGENTS.md");
}

function tomlBlock(ctx) {
  const hook = rewriterCommand(ctx.payloadDir, "codex").replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  const lines = [];
  if (ctx.headroomAvailable) {
    lines.push("[mcp_servers.headroom]", 'command = "headroom"', 'args = ["mcp", "serve"]', "");
  }
  lines.push(
    "[[hooks.PreToolUse]]",
    'matcher = "^(shell|local_shell|Bash)$"',
    'type = "command"',
    `command = "${hook}"`,
    "timeout = 10",
  );
  return lines.join("\n");
}

export function install(ctx) {
  const { home, journal, payloadDir } = ctx;
  appendMarkerBlock(journal, configFile(home), tomlBlock(ctx));
  appendMarkerBlock(
    journal,
    agentsFile(home),
    readText(join(payloadDir, "rules", "token-hygiene.md")),
  );
  copyDir(
    journal,
    join(payloadDir, "skills", "scrooge-hygiene"),
    join(home, ".codex", "skills", "scrooge-hygiene"),
  );
}

export function uninstall(ctx) {
  const { home, journal } = ctx;
  removeMarkerBlock(journal, configFile(home));
  removeMarkerBlock(journal, agentsFile(home));
  removeDir(journal, join(home, ".codex", "skills", "scrooge-hygiene"));
}

export function verify(ctx) {
  const { home } = ctx;
  return [
    { name: "config.toml block present", pass: hasMarkerBlock(configFile(home)) },
    { name: "AGENTS.md rules present", pass: hasMarkerBlock(agentsFile(home)) },
    {
      name: "skill installed",
      pass: existsSync(join(home, ".codex", "skills", "scrooge-hygiene", "SKILL.md")),
    },
  ];
}
