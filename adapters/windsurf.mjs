import { join } from "node:path";
import {
  appendMarkerBlock,
  hasMarkerBlock,
  readText,
  removeMarkerBlock,
} from "../core/fsutil.mjs";
import { headroomEntry, mergeMcpServers, pruneMcpServers } from "../core/mcp-merge.mjs";

// Windsurf: Cascade hooks only gate (exit code), they don't transform, so the
// integration is rules + MCP: token-hygiene rules go into the global
// memories file, headroom into mcp_config.json.

function mcpFile(home) {
  return join(home, ".codeium", "windsurf", "mcp_config.json");
}

function rulesFile(home) {
  return join(home, ".codeium", "windsurf", "memories", "global_rules.md");
}

export function install(ctx) {
  const { home, journal, payloadDir } = ctx;
  appendMarkerBlock(
    journal,
    rulesFile(home),
    readText(join(payloadDir, "rules", "token-hygiene.md")),
  );
  mergeMcpServers(journal, mcpFile(home), {
    headroom: headroomEntry(ctx.headroomAvailable),
  });
}

export function uninstall(ctx) {
  const { home, journal } = ctx;
  removeMarkerBlock(journal, rulesFile(home));
  pruneMcpServers(journal, mcpFile(home), { headroom: headroomEntry(false) });
}

export function verify(ctx) {
  return [
    { name: "global rules block present", pass: hasMarkerBlock(rulesFile(ctx.home)) },
  ];
}
