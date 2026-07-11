import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export function binaryAvailable(binary) {
  try {
    execFileSync(process.platform === "win32" ? "where" : "which", [binary], {
      stdio: "ignore",
      timeout: 3000,
    });
    return true;
  } catch {
    return false;
  }
}

// An agent is "present" when its config surface exists on this machine.
// `install --agent all` targets only present agents; an explicit
// `--agent <name>` installs regardless (the adapter creates what it needs).
const AGENT_PROBES = {
  "claude-code": (home) => join(home, ".claude"),
  codex: (home) => join(home, ".codex"),
  "gemini-cli": (home) => join(home, ".gemini"),
  antigravity: (home) => join(home, ".gemini", "antigravity-cli"),
  opencode: (home) => join(home, ".config", "opencode"),
  grok: (home) => join(home, ".grok"),
  cursor: (home) => join(home, ".cursor"),
  windsurf: (home) => join(home, ".codeium", "windsurf"),
};

export const AGENT_NAMES = Object.keys(AGENT_PROBES);

export function detectAgents(home = homedir()) {
  return AGENT_NAMES.filter((name) => existsSync(AGENT_PROBES[name](home)));
}
