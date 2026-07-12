// Single source of truth for what gets routed through rtk.
// Shared by the installer (core/policy re-export) and the runtime hooks —
// the payload directory is copied verbatim to ~/.scrooge-kit, so this file
// must stay self-contained (node builtins only).

export const PREFIXES = [
  "git",
  "gh",
  "npm",
  "pnpm",
  "yarn",
  "bun",
  "cargo",
  "go",
  "pytest",
  "jest",
  "vitest",
  "tsc",
  "eslint",
  "ruff",
  "mypy",
  "docker",
  "kubectl",
  "make",
  "gradle",
  "mvn",
  "pip",
  "bundle",
];

// Documented bypass: SCROOGE_RAW=1 <cmd> runs unfiltered. KIT_RAW=1 is
// honored too so antigravity-kit muscle memory keeps working.
const RAW_PREFIX_RE = /^(SCROOGE_RAW|KIT_RAW)=1\s/;
const ENV_ASSIGNMENTS_RE = /^((?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*)([\s\S]*)$/;

// Returns the rtk-prefixed command, or null when no rewrite applies.
// Inserting into the original string (not re-joining tokens) preserves
// quoting and internal spacing.
export function rewriteCommand(cmd, env = {}) {
  if (!cmd || typeof cmd !== "string") return null;
  const trimmed = cmd.trim();

  if (env.SCROOGE_RTK === "off") return null;
  if (trimmed === "rtk" || trimmed.startsWith("rtk ")) return null;
  if (RAW_PREFIX_RE.test(trimmed)) return null;
  // Compound/redirected commands: rewriting is risky, stay out of the way.
  if (/[|;&><$`\n]/.test(trimmed)) return null;

  // Env-assignment prefixes don't change the command: NODE_ENV=test npm ...
  const [, envPart, rest] = trimmed.match(ENV_ASSIGNMENTS_RE);
  const first = rest.split(/\s+/, 1)[0] ?? "";
  if (!PREFIXES.includes(first)) return null;

  return `${envPart}rtk ${rest}`;
}
