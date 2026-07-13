#!/usr/bin/env node
// Smoke test: can every agent CLI on this machine install the native plugin
// without errors — WITHOUT touching real user state?
//
// Strategy:
//   1. Fingerprint + back up the real config dirs a misbehaving CLI could touch.
//   2. Run each agent's native install/uninstall inside a DISPOSABLE sandbox
//      (HOME / CLAUDE_CONFIG_DIR / CODEX_HOME redirected into a temp dir).
//   3. Re-fingerprint the real dirs; if anything drifted, restore from backup.
//
// Usage: node scripts/smoke-install.mjs
// Exit code: 1 if any agent FAILED or real state drifted, 0 otherwise.

import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { homedir, tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HOME = homedir();
const TIMEOUT = 120_000;

// Real state a misbehaving CLI could touch. ~/.claude and ~/.gemini are
// scoped to their plugin-relevant paths only — the rest is live session
// state (oauth tokens, project history, agy databases) that churns on its
// own and must never be blanket-restored.
const PROTECTED = [
  join(HOME, ".claude", "settings.json"),
  join(HOME, ".claude", "plugins"),
  join(HOME, ".gemini", "extensions"),
  join(HOME, ".gemini", "config", "plugins"),
  join(HOME, ".gemini", "config", "import_manifest.json"),
  join(HOME, ".codex"),
  join(HOME, ".grok"),
  join(HOME, ".config", "opencode"),
  join(HOME, ".agents"),
];

// ---------- state fingerprint / backup / restore ----------

// Volatile paths CLIs churn on their own (temp files, caches, logs, session
// history). Excluded from both the fingerprint and the backup — they are not
// plugin state and would produce false drift.
const VOLATILE_RE = /(^|\/)(tmp|te?mp-.*|cache|caches|logs?|history|sessions?|shell-snapshots|todos|\.DS_Store)(\/|$)/i;

function fingerprint(path) {
  if (!existsSync(path)) return "absent";
  const hash = createHash("sha256");
  const walk = (p) => {
    let st;
    try {
      st = lstatSync(p); // never follow symlinks; broken links are fine
    } catch {
      return; // vanished mid-walk (live CLI temp file)
    }
    if (VOLATILE_RE.test(relative(path, p))) return;
    if (st.isDirectory()) {
      for (const entry of readdirSync(p).sort()) walk(join(p, entry));
    } else {
      hash.update(`${relative(path, p)}|${st.size}|${st.mtimeMs}\n`);
    }
  };
  walk(path);
  return hash.digest("hex");
}

function backupAll(backupDir) {
  const map = {};
  for (const path of PROTECTED) {
    map[path] = fingerprint(path);
    if (existsSync(path)) {
      const dest = join(backupDir, path.replaceAll("/", "_"));
      cpSync(path, dest, {
        recursive: true,
        force: true,
        verbatimSymlinks: true,
        filter: (src) => !VOLATILE_RE.test(relative(path, src)),
      });
    }
  }
  return map;
}

function restoreDrifted(before, backupDir) {
  const drifted = [];
  for (const path of PROTECTED) {
    if (fingerprint(path) === before[path]) continue;
    drifted.push(path);
    const backup = join(backupDir, path.replaceAll("/", "_"));
    rmSync(path, { recursive: true, force: true });
    if (before[path] !== "absent") {
      mkdirSync(dirname(path), { recursive: true });
      cpSync(backup, path, { recursive: true, force: true, verbatimSymlinks: true });
    }
  }
  return drifted;
}

// ---------- helpers ----------

function which(bin) {
  return spawnSync(process.platform === "win32" ? "where" : "which", [bin], {
    stdio: "ignore",
    timeout: 3000,
  }).status === 0;
}

function run(argv, env, note = "", input = "") {
  const res = spawnSync(argv[0], argv.slice(1), {
    env,
    encoding: "utf8",
    timeout: TIMEOUT,
    input,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const out = `${res.stdout ?? ""}${res.stderr ?? ""}`.trim();
  const ok = res.status === 0 && !res.error;
  return {
    name: note || argv.join(" "),
    ok,
    out,
    timedOut: res.error?.code === "ETIMEDOUT",
  };
}

function sandbox(prefix) {
  const sb = mkdtempSync(join(tmpdir(), `scrooge-smoke-${prefix}-`));
  // Pre-create the usual suspects so CLIs don't stumble on a bare home.
  for (const d of [".config", ".cache", ".local/share"]) mkdirSync(join(sb, d), { recursive: true });
  return sb;
}

const results = [];
function report(agent, status, steps, note = "") {
  results.push({ agent, status, steps, note });
  const mark = { PASS: "✅", FAIL: "❌", SKIP: "⏭️ ", PARTIAL: "🟡" }[status];
  console.log(`\n${mark} ${agent} — ${status}${note ? ` (${note})` : ""}`);
  for (const s of steps) {
    console.log(`   ${s.ok ? "ok  " : "FAIL"} ${s.name}${s.timedOut ? " [timeout]" : ""}`);
    if (!s.ok && s.out) console.log(`        ${s.out.split("\n").slice(0, 6).join("\n        ")}`);
  }
}

// ---------- per-agent runners ----------

function testClaude() {
  if (!which("claude")) return report("claude-code", "SKIP", [], "binary not found");
  const sb = sandbox("claude");
  // CLAUDE_CONFIG_DIR isolates all plugin/settings state; real HOME stays
  // for auth. Plugin commands are local operations.
  const env = { ...process.env, CLAUDE_CONFIG_DIR: join(sb, "claude-config") };
  const steps = [
    run(["claude", "plugin", "marketplace", "add", ROOT], env),
    run(["claude", "plugin", "install", "scrooge-kit@scrooge-kit", "--scope", "user"], env),
    run(["claude", "plugin", "install", "scrooge-headroom@scrooge-kit", "--scope", "user"], env),
    run(["claude", "plugin", "install", "scrooge-serena@scrooge-kit", "--scope", "user"], env),
  ];
  const list = run(["claude", "plugin", "list"], env);
  list.ok =
    list.ok &&
    list.out.includes("scrooge-kit") &&
    list.out.includes("scrooge-headroom") &&
    list.out.includes("scrooge-serena");
  list.name = "claude plugin list → all three plugins present";
  steps.push(list);
  steps.push(run(["claude", "plugin", "uninstall", "scrooge-kit@scrooge-kit", "--scope", "user"], env));
  steps.push(run(["claude", "plugin", "uninstall", "scrooge-headroom@scrooge-kit", "--scope", "user"], env));
  steps.push(run(["claude", "plugin", "uninstall", "scrooge-serena@scrooge-kit", "--scope", "user"], env));
  rmSync(sb, { recursive: true, force: true });
  report("claude-code", steps.every((s) => s.ok) ? "PASS" : "FAIL", steps);
}

function testGemini() {
  if (!which("gemini")) return report("gemini-cli", "SKIP", [], "binary not found");
  const sb = sandbox("gemini");
  const env = { ...process.env, HOME: sb };
  // --consent covers the extension-risk prompt; the folder-trust prompt still
  // reads stdin in a fresh HOME, so feed it a "y".
  const install = run(
    ["gemini", "extensions", "install", join(ROOT, "plugins", "gemini-cli"), "--consent"],
    env,
    "",
    "y\n",
  );
  const steps = [install];
  const list = run(["gemini", "extensions", "list"], env);
  list.ok = list.ok && /scrooge-kit/.test(list.out);
  list.name = "gemini extensions list → scrooge-kit present";
  steps.push(list);
  steps.push(run(["gemini", "extensions", "uninstall", "scrooge-kit"], env));
  rmSync(sb, { recursive: true, force: true });
  report("gemini-cli", steps.every((s) => s.ok) ? "PASS" : "FAIL", steps);
}

function testAgy() {
  if (!which("agy")) return report("antigravity", "SKIP", [], "binary not found");
  const sb = sandbox("agy");
  const env = { ...process.env, HOME: sb };
  const steps = [run(["agy", "plugin", "install", join(ROOT, "plugins", "antigravity")], env)];
  const list = run(["agy", "plugin", "list"], env);
  list.ok = list.ok && /scrooge-kit/.test(list.out);
  list.name = "agy plugin list → scrooge-kit present";
  steps.push(list);
  steps.push(run(["agy", "plugin", "uninstall", "scrooge-kit"], env));
  rmSync(sb, { recursive: true, force: true });
  report("antigravity", steps.every((s) => s.ok) ? "PASS" : "FAIL", steps);
}

function testCodex() {
  if (!which("codex")) return report("codex", "SKIP", [], "binary not found");
  const sb = sandbox("codex");
  const env = { ...process.env, CODEX_HOME: join(sb, "codex") };
  mkdirSync(env.CODEX_HOME, { recursive: true });
  const steps = [run(["codex", "plugin", "marketplace", "add", ROOT], env)];
  steps.push(run(["codex", "plugin", "add", "scrooge-kit@scrooge-kit"], env));
  const list = run(["codex", "plugin", "list"], env);
  list.ok = list.ok && /scrooge-kit/.test(list.out);
  list.name = "codex plugin list → scrooge-kit present";
  steps.push(list);
  steps.push(run(["codex", "plugin", "remove", "scrooge-kit@scrooge-kit"], env));
  rmSync(sb, { recursive: true, force: true });
  report("codex", steps.every((s) => s.ok) ? "PASS" : "FAIL", steps);
}

function testGrok() {
  if (!which("grok")) return report("grok", "SKIP", [], "binary not found");
  const sb = sandbox("grok");
  const env = { ...process.env, HOME: sb };
  const probe = run(["grok", "plugin", "--help"], env, "probe: grok plugin --help");
  if (probe.ok && /install/i.test(probe.out)) {
    const steps = [run(["grok", "plugin", "validate", join(ROOT, "plugins", "grok")], env)];
    steps.push(run(["grok", "plugin", "install", join(ROOT, "plugins", "grok"), "--trust"], env));
    const list = run(["grok", "plugin", "list"], env);
    list.ok = list.ok && /scrooge-kit/.test(list.out);
    list.name = "grok plugin list → scrooge-kit present";
    steps.push(list);
    steps.push(run(["grok", "plugin", "uninstall", "scrooge-kit"], env));
    rmSync(sb, { recursive: true, force: true });
    report("grok", steps.every((s) => s.ok) ? "PASS" : "FAIL", steps, "Grok Build plugin CLI");
    return;
  }
  // Community grok-cli has no plugin system: validate the manual-copy path —
  // plugin dir lands in ~/.grok/plugins and the hook script runs fail-open.
  const dest = join(sb, ".grok", "plugins", "scrooge-kit");
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(join(ROOT, "plugins", "grok"), dest, { recursive: true });
  const hook = spawnSync(
    process.execPath,
    [join(dest, "scripts", "rtk-rewriter.mjs"), "grok"],
    {
      input: JSON.stringify({ tool_name: "Bash", tool_input: { command: "git status" } }),
      env: { ...process.env, SCROOGE_TEST_RTK: "1" },
      encoding: "utf8",
      timeout: 15_000,
    },
  );
  const ok = hook.status === 0 && hook.stdout.includes("rtk git status");
  rmSync(sb, { recursive: true, force: true });
  report(
    "grok",
    ok ? "PARTIAL" : "FAIL",
    [probe, { name: "manual copy to ~/.grok/plugins + hook smoke", ok, out: hook.stdout?.trim() ?? "" }],
    "no native plugin CLI in this grok build — manual-copy path validated",
  );
}

async function testOpencode() {
  if (!which("opencode")) return report("opencode", "SKIP", [], "binary not found");
  // Native path only works once the package is on npm; probe first.
  const published = run(
    ["npm", "view", "@sipki-tech/scrooge-kit-opencode", "version"],
    process.env,
    "probe: npm view @sipki-tech/scrooge-kit-opencode",
  );
  if (published.ok) {
    const sb = sandbox("opencode");
    const env = { ...process.env, HOME: sb, XDG_CONFIG_HOME: join(sb, ".config") };
    const steps = [published];
    const install = run(
      ["opencode", "plugin", "-g", "@sipki-tech/scrooge-kit-opencode"],
      env,
      "opencode plugin -g @sipki-tech/scrooge-kit-opencode",
    );
    steps.push(install);
    rmSync(sb, { recursive: true, force: true });
    return report("opencode", steps.every((s) => s.ok) ? "PASS" : "FAIL", steps, "native npm install");
  }
  // Not published yet: validate that the plugin module loads and hooks behave.
  try {
    const mod = await import(`file://${join(ROOT, "plugins", "opencode", "index.js")}`);
    const hooks = await mod.ScroogeKit();
    const output = { args: { command: "git status" } };
    await hooks["tool.execute.before"]({ tool: "bash" }, output);
    await hooks.config({});
    report(
      "opencode",
      "PARTIAL",
      [{ name: "plugin module imports; hooks run fail-open", ok: true, out: "" }],
      "npm package not published yet — module load validated only",
    );
  } catch (err) {
    report("opencode", "FAIL", [{ name: "plugin module import", ok: false, out: String(err) }]);
  }
}

// ---------- main ----------

console.log("scrooge-kit install smoke test");
console.log(`repo: ${ROOT}`);

const backupDir = mkdtempSync(join(tmpdir(), "scrooge-smoke-backup-"));
console.log(`state backup: ${backupDir}`);
const before = backupAll(backupDir);

testClaude();
testGemini();
testAgy();
// agy's plugin manager may stamp installed_version.json into the payload —
// never let it land in the repo tree (see the antigravity loader-traps test).
rmSync(join(ROOT, "plugins", "antigravity", "installed_version.json"), { force: true });
testCodex();
testGrok();
await testOpencode();

const drifted = restoreDrifted(before, backupDir);

console.log("\n================ summary ================");
for (const r of results) console.log(`${r.status.padEnd(7)} ${r.agent}${r.note ? ` — ${r.note}` : ""}`);
if (drifted.length) {
  console.log(`\n⚠️  real state drifted and was RESTORED from backup:\n  ${drifted.join("\n  ")}`);
} else {
  console.log("\nreal user state: untouched ✔");
  rmSync(backupDir, { recursive: true, force: true });
}
if (drifted.length) console.log(`backup kept at: ${backupDir}`);

const failed = results.some((r) => r.status === "FAIL");
process.exit(failed || drifted.length ? 1 : 0);
