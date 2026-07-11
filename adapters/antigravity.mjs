import { existsSync } from "node:fs";
import { join } from "node:path";
import { copyDir, readJson, removeDir, writeJson } from "../core/fsutil.mjs";
import { headroomEntry, mergeMcpServers, pruneMcpServers } from "../core/mcp-merge.mjs";
import { KIT_NAME } from "./shared.mjs";

// Antigravity: a proper plugin under ~/.gemini/config/plugins (mirrored into
// ~/.gemini/antigravity-cli/plugins when that surface exists). Carries the
// known loader traps: installed_version.json, object author, hooks.json at
// the plugin root with named top-level key. The rewriter runs in the
// deny-nudge dialect — arg mutation is unverified on this host.

function pluginDirs(home) {
  const primary = join(home, ".gemini", "config", "plugins", KIT_NAME);
  const mirrors = [];
  const cliPlugins = join(home, ".gemini", "antigravity-cli", "plugins");
  if (existsSync(cliPlugins)) mirrors.push(join(cliPlugins, KIT_NAME));
  return { primary, mirrors };
}

function mcpConfigFile(home) {
  return join(home, ".gemini", "config", "mcp_config.json");
}

function writePlugin(ctx, dir) {
  const { journal, payloadDir, version } = ctx;
  writeJson(journal, join(dir, "plugin.json"), {
    name: KIT_NAME,
    version,
    description: "Token-saving kit: rtk command-output compression + headroom MCP",
    author: { name: "sipki-tech" },
    skills: "./skills",
    rules: "./rules",
    hooks: "./hooks.json",
    interface: {
      displayName: "Scrooge Kit",
      capabilities: ["Hooks", "Skills", "Rules", "MCP", "Token Optimization"],
      brandColor: "#F4C542",
    },
  });
  writeJson(journal, join(dir, "hooks.json"), {
    [KIT_NAME]: {
      PreToolUse: [
        {
          matcher: "run_command",
          hooks: [
            {
              type: "command",
              command: `node "\${PLUGIN_ROOT}/scripts/rtk-rewriter.mjs" antigravity`,
              timeout: 10,
              statusMessage: "scrooge: rtk token hygiene",
            },
          ],
        },
      ],
    },
  });
  copyDir(journal, join(payloadDir, "scripts"), join(dir, "scripts"));
  copyDir(journal, join(payloadDir, "skills"), join(dir, "skills"));
  copyDir(journal, join(payloadDir, "rules"), join(dir, "rules"));
  // Loader recognition flag — without it the plugin is silently ignored.
  writeJson(journal, join(dir, "installed_version.json"), { version });
}

export function install(ctx) {
  const { home, journal } = ctx;
  const { primary, mirrors } = pluginDirs(home);
  for (const dir of [primary, ...mirrors]) {
    removeDir(journal, dir); // clean re-install, no stale artifacts
    writePlugin(ctx, dir);
  }
  mergeMcpServers(journal, mcpConfigFile(home), {
    headroom: headroomEntry(ctx.headroomAvailable),
  });
}

export function uninstall(ctx) {
  const { home, journal } = ctx;
  const { primary, mirrors } = pluginDirs(home);
  for (const dir of [primary, ...mirrors]) removeDir(journal, dir);
  pruneMcpServers(journal, mcpConfigFile(home), {
    headroom: headroomEntry(false),
  });
}

export function verify(ctx) {
  const { primary } = pluginDirs(ctx.home);
  const manifest = readJson(join(primary, "plugin.json"));
  return [
    { name: "plugin.json parses", pass: manifest?.name === KIT_NAME },
    { name: "author is an object", pass: typeof manifest?.author === "object" },
    {
      name: "installed_version.json present",
      pass: existsSync(join(primary, "installed_version.json")),
    },
    {
      name: "hooks.json named block",
      pass: Boolean(readJson(join(primary, "hooks.json"))?.[KIT_NAME]),
    },
    {
      name: "rewriter script installed",
      pass: existsSync(join(primary, "scripts", "rtk-rewriter.mjs")),
    },
  ];
}
