import { execSync } from "node:child_process";
import { binaryAvailable } from "../detect.mjs";

// `scrooge-kit status` delegates spend reporting to ccusage — it already
// reads the local logs of Claude Code, Codex, Gemini CLI, OpenCode and
// friends; no reason to reimplement parsers.
export function runUsageReport({ log = console.log } = {}) {
  if (!binaryAvailable("npx")) {
    log("status: npx not found — install Node/npm to get usage reports via ccusage");
    return false;
  }
  try {
    execSync("npx -y ccusage@latest", { stdio: "inherit" });
    return true;
  } catch {
    log("status: ccusage run failed (see output above)");
    return false;
  }
}

// Claude Code statusline entry powered by ccusage. Only offered when the
// user asks (--statusline) and only written when no statusline is set.
export const CCUSAGE_STATUSLINE = {
  type: "command",
  command: "npx -y ccusage statusline",
  padding: 0,
};
