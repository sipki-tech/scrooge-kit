import { existsSync } from "node:fs";
import { join } from "node:path";
import { copyDir, readJson, readText, removeDir, writeJson, writeText } from "../core/fsutil.mjs";
import { headroomEntry } from "../core/mcp-merge.mjs";
import { rewriterCommand, KIT_NAME } from "./shared.mjs";

// Gemini CLI: everything ships as one extension under ~/.gemini/extensions —
// manifest (with mcpServers), context file (rules), and hooks. Removing the
// extension directory uninstalls it all; no shared config is touched.

function extensionDir(home) {
  return join(home, ".gemini", "extensions", KIT_NAME);
}

export function install(ctx) {
  const { home, journal, payloadDir, version } = ctx;
  const dir = extensionDir(home);

  const manifest = {
    name: KIT_NAME,
    version,
    description: "Token-saving kit: rtk command-output compression + headroom MCP",
    contextFileName: "GEMINI.md",
    mcpServers: {
      headroom: headroomEntry(ctx.headroomAvailable),
    },
  };
  writeJson(journal, join(dir, "gemini-extension.json"), manifest);
  writeText(journal, join(dir, "GEMINI.md"), readText(join(payloadDir, "rules", "token-hygiene.md")));
  writeJson(journal, join(dir, "hooks", "hooks.json"), {
    PreToolUse: [
      {
        matcher: "run_shell_command",
        hooks: [
          {
            type: "command",
            command: rewriterCommand(payloadDir, "gemini-cli"),
            timeout: 10,
          },
        ],
      },
    ],
  });
  copyDir(
    journal,
    join(payloadDir, "skills", "scrooge-hygiene"),
    join(dir, "skills", "scrooge-hygiene"),
  );
}

export function uninstall(ctx) {
  removeDir(ctx.journal, extensionDir(ctx.home));
}

export function verify(ctx) {
  const dir = extensionDir(ctx.home);
  const manifest = readJson(join(dir, "gemini-extension.json"));
  return [
    { name: "extension manifest", pass: manifest?.name === KIT_NAME },
    { name: "hooks.json present", pass: existsSync(join(dir, "hooks", "hooks.json")) },
    { name: "GEMINI.md rules present", pass: existsSync(join(dir, "GEMINI.md")) },
  ];
}
