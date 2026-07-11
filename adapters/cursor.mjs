import { join } from "node:path";
import { readJson, writeJson } from "../core/fsutil.mjs";
import { headroomEntry, mergeMcpServers, pruneMcpServers } from "../core/mcp-merge.mjs";
import { isOurs, rewriterCommand } from "./shared.mjs";

// Cursor: hooks can gate/annotate but not rewrite, so the rewriter runs in
// nudge mode (agent_message suggesting the rtk-prefixed command). Headroom
// registers in the global ~/.cursor/mcp.json. Rules are project-scoped in
// Cursor — install prints the one-liner to add as a User Rule.

function hooksFile(home) {
  return join(home, ".cursor", "hooks.json");
}

function mcpFile(home) {
  return join(home, ".cursor", "mcp.json");
}

export function install(ctx) {
  const { home, journal, payloadDir, log } = ctx;
  const file = hooksFile(home);
  const config = readJson(file, { version: 1, hooks: {} });
  const entries = config.hooks?.beforeShellExecution ?? [];
  if (!entries.some(isOurs)) {
    writeJson(journal, file, {
      ...config,
      version: config.version ?? 1,
      hooks: {
        ...(config.hooks ?? {}),
        beforeShellExecution: [
          ...entries,
          { command: rewriterCommand(payloadDir, "cursor") },
        ],
      },
    });
  }
  mergeMcpServers(journal, mcpFile(home), {
    headroom: headroomEntry(ctx.headroomAvailable),
  });
  log(
    "cursor: hooks can't rewrite commands — add this User Rule for full effect: " +
      '"Prefix dev terminal commands (git, tests, builds, linters) with rtk; bypass with SCROOGE_RAW=1 when raw output matters."',
  );
}

export function uninstall(ctx) {
  const { home, journal } = ctx;
  const file = hooksFile(home);
  const config = readJson(file);
  const entries = config?.hooks?.beforeShellExecution;
  if (Array.isArray(entries)) {
    const kept = entries.filter((e) => !isOurs(e));
    if (kept.length !== entries.length) {
      const next = { ...config, hooks: { ...config.hooks } };
      if (kept.length) next.hooks.beforeShellExecution = kept;
      else delete next.hooks.beforeShellExecution;
      writeJson(journal, file, next);
    }
  }
  pruneMcpServers(journal, mcpFile(home), { headroom: headroomEntry(false) });
}

export function verify(ctx) {
  const config = readJson(hooksFile(ctx.home), {});
  return [
    {
      name: "beforeShellExecution nudge registered",
      pass: JSON.stringify(config.hooks?.beforeShellExecution ?? "").includes("scrooge-kit"),
    },
  ];
}
