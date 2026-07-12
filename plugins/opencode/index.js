// OpenCode plugin: in-process command rewriting + conditional Headroom MCP.
// Fail-open everywhere — a bug here must cost savings, never a session.
import { execFileSync } from "node:child_process";
import { rewriteCommand } from "./lib/policy.mjs";

const probes = {};
function binaryAvailable(binary) {
  if (probes[binary] !== undefined) return probes[binary];
  try {
    execFileSync(process.platform === "win32" ? "where" : "which", [binary], {
      stdio: "ignore",
      timeout: 2000,
    });
    probes[binary] = true;
  } catch {
    probes[binary] = false;
  }
  return probes[binary];
}

export const ScroogeKit = async () => ({
  "tool.execute.before": async (input, output) => {
    try {
      if (input.tool !== "bash") return;
      if (!binaryAvailable("rtk")) return;
      const rewritten = rewriteCommand(output.args?.command, process.env);
      if (rewritten) output.args.command = rewritten;
    } catch {
      // fail-open
    }
  },
  config: async (config) => {
    try {
      // Register Headroom only when the binary exists — a missing binary
      // must not produce MCP connection errors.
      if (!binaryAvailable("headroom")) return;
      config.mcp = {
        ...(config.mcp ?? {}),
        headroom: config.mcp?.headroom ?? {
          type: "local",
          command: ["headroom", "mcp", "serve"],
          enabled: true,
        },
      };
    } catch {
      // fail-open
    }
  },
});
