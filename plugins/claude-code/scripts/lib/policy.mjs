// Single source of truth for what gets routed through rtk.
// Shared by the installer (core/policy re-export) and the runtime hooks —
// the payload directory is copied verbatim to ~/.scrooge-kit, so this file
// must stay self-contained (node builtins only).

// Mirrors the dev tools rtk actually proxies (from `rtk --help`, rtk 0.43.0).
// rtk passes through anything it can't compress, so an over-broad entry never
// breaks a command — but it wastes a turn on decision hosts, so we list only
// what rtk genuinely compresses. Deliberately excluded:
//   • yarn, bun, make, gradle, bundle, eslint — NOT proxied by rtk 0.43.0
//     (passthrough only; `eslint` lives under `rtk lint`, `gradle` under gradlew).
//   • curl, playwright — rtk's own docs recommend excluding these
//     (compression interferes); they ship in rtk's default exclude examples.
//   • ls, tree, find, grep, rg, cat — the agent's native search/read territory
//     (host tools like Grep/Glob bypass the hook anyway); `rtk ls -R` can also
//     grow output, so we don't auto-route file/search utilities.
export const PREFIXES = [
  // version control / forge
  "git", "gh", "glab",
  // package managers
  "npm", "npx", "pnpm", "pip",
  // compiled-language build/test
  "cargo", "go", "golangci-lint", "gradlew", "mvn", "dotnet",
  // test / lint / typecheck / build
  "pytest", "jest", "vitest", "rspec", "rake", "rubocop", "ruff", "mypy",
  "tsc", "next", "prisma", "prettier",
  // containers / cloud / db / net
  "docker", "kubectl", "oc", "aws", "psql", "wget",
];

// `git` is multi-command: route only the subcommands rtk actually compresses
// (the `rtk git` subcommand set, rtk 0.43.0). rtk condenses even the mutating
// ones (`push`→"ok <branch>", `commit`→"ok <hash>"). Everything not listed —
// notably `clone`, plus checkout/switch/merge/rebase/reset/init/config/remote/
// tag/… — is left alone (rtk has no handler; nudging it only wastes a turn).
const GIT_COMPRESSIBLE = new Set([
  "status", "diff", "log", "show", "add", "commit",
  "push", "pull", "branch", "fetch", "stash", "worktree",
]);

// The subcommand of a `git …` invocation, skipping pre-command options:
// `-C <path>` and `-c <name>=<val>` take an argument; `--no-pager`, `--git-dir=…`
// and other `-*` flags are single tokens.
function gitSubcommand(tokensAfterGit) {
  for (let i = 0; i < tokensAfterGit.length; i++) {
    const t = tokensAfterGit[i];
    if (t === "-C" || t === "-c") { i++; continue; }
    if (t.startsWith("-")) continue;
    return t;
  }
  return "";
}

// Documented bypass: SCROOGE_RAW=1 <cmd> runs unfiltered. KIT_RAW=1 is
// honored too so antigravity-kit muscle memory keeps working.
const RAW_PREFIX_RE = /^(SCROOGE_RAW|KIT_RAW)=1\s/;
const ENV_ASSIGNMENTS_RE = /^((?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*)([\s\S]*)$/;

// Rewrite a SINGLE simple command (no shell operators). Returns the rtk-prefixed
// string, or null when no rewrite applies. Inserting into the original string
// (not re-joining tokens) preserves quoting and internal spacing.
function rewriteSegment(seg, env) {
  const t = seg.trim();
  if (!t) return null;
  if (t === "rtk" || t.startsWith("rtk ")) return null; // already prefixed
  if (RAW_PREFIX_RE.test(t)) return null; // explicit bypass
  // Any shell operator means this isn't a plain command — stay out of the way.
  if (/[|;&<>$`\n]/.test(t)) return null;

  // Env-assignment prefixes don't change the command: NODE_ENV=test npm ...
  const [, envPart, rest] = t.match(ENV_ASSIGNMENTS_RE);
  const tokens = rest.split(/\s+/);
  const first = tokens[0] ?? "";
  if (!PREFIXES.includes(first)) return null;

  // git only benefits on its verbose read-only subcommands; skip clone/push/etc.
  if (first === "git" && !GIT_COMPRESSIBLE.has(gitSubcommand(tokens.slice(1)))) return null;

  return `${envPart}rtk ${rest}`;
}

// Returns the rtk-prefixed command, or null when no rewrite applies. Handles a
// single command and a plain `A && B && …` chain (wrapping each dev segment),
// but never restructures pipes/redirects/subshells — when in doubt, null.
export function rewriteCommand(cmd, env = {}) {
  if (!cmd || typeof cmd !== "string") return null;
  const trimmed = cmd.trim();
  if (env.SCROOGE_RTK === "off") return null;

  if (trimmed.includes("&&")) {
    // Only a quote-free `A && B && …` chain of simple commands is safe to split:
    // a quote could hide a literal `&&`, and any other operator (| ; & < > $ ` ( ) { })
    // in a segment means it isn't a plain command — bail rather than risk it.
    if (/['"]/.test(trimmed)) return null;
    const segments = trimmed.split("&&");
    if (segments.some((s) => /[|;&<>$`(){}\n]/.test(s))) return null;
    let changed = false;
    const out = segments.map((s) => {
      const r = rewriteSegment(s, env);
      if (r !== null) {
        changed = true;
        return r;
      }
      return s.trim();
    });
    return changed ? out.join(" && ") : null; // null when no segment was a dev cmd
  }

  return rewriteSegment(trimmed, env);
}
