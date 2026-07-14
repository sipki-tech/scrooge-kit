#!/usr/bin/env node
// Two-layer integration check for Scrooge Kit.
//
//   Layer A — harness-verified (deterministic, no LLM tokens):
//     • hook wire contract per dialect (deny-nudge / silent rewrite / explicit allow)
//     • MCP servers bundled + enabled (Headroom + codebase-memory, no `disabled`)
//     • rtk / headroom / codebase-memory-mcp binaries on PATH (soft)
//     • codebase-memory resolves references on the polyglot fixture (Go + JS) via
//       its own `cli` — indexes once, then trace_path(inbound) for a KNOWN
//       symbol→caller pair. Empty callers = failure (the reference provably exists).
//
//   Layer B — agent-driven (best-effort, spends real LLM tokens):
//     Drives real `agy -p` / `grok -p` headless against the fixture and greps the
//     transcript for end-to-end markers (bare `git status` → deny-nudge, `ls` not
//     blocked, Headroom roundtrip, codebase-memory references resolved).
//
// Usage:
//   node scripts/headless-check.mjs             # both layers
//   node scripts/headless-check.mjs --no-agents # Layer A only (fast, free)
//
// Exit 1 if any Layer-A hard check FAILS. Layer B is advisory (WARN).

import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HOOK = join(ROOT, "shared", "scripts", "rtk-rewriter.mjs");
const FIXTURE = join(ROOT, "test", "fixtures", "headless-project");
const PROMPT = readFileSync(join(ROOT, "test", "prompts", "self-check.md"), "utf8");
const NODE = process.execPath;
const NO_AGENTS = process.argv.includes("--no-agents");

// Known symbol → expected caller baked into the polyglot fixture (see its
// README). codebase-memory reports the enclosing caller for an inbound ref:
// a function name (Go `main`) or, for a top-level call, the module (JS
// `index.mjs`). `expect` is matched against caller name + qualified_name.
const SYMBOLS = [
  { lang: "go", name: "Greet", expect: "main", callsite: "main.go" },
  { lang: "js", name: "greet", expect: "index", callsite: "index.mjs" },
];

let hardFail = false;
const log = (s = "") => console.log(s);
function hard(ok, label, detail = "") {
  if (!ok) hardFail = true;
  log(`   ${ok ? "ok  " : "FAIL"} ${label}`);
  if (!ok && detail) log(`        ${detail}`);
}
function soft(ok, label, hint = "") {
  log(`   ${ok ? "ok  " : "WARN"} ${label}`);
  if (!ok && hint) log(`        ${hint}`);
}

function which(bin) {
  return (
    spawnSync(process.platform === "win32" ? "where" : "which", [bin], {
      stdio: "ignore",
      timeout: 3000,
    }).status === 0
  );
}

// Pipe a synthetic host event through the real hook with rtk forced-available.
function pipeHook(dialect, command) {
  const res = spawnSync(NODE, [HOOK, dialect], {
    input: JSON.stringify({ tool_input: { command } }),
    env: { ...process.env, SCROOGE_TEST_RTK: "1" },
    encoding: "utf8",
    timeout: 10_000,
  });
  try {
    return JSON.parse(res.stdout || "{}");
  } catch {
    return { _unparsable: res.stdout };
  }
}

// Run a codebase-memory `cli <tool>` command and return the last JSON object it
// printed (it interleaves `level=info` log lines with the JSON result).
function cbmCli(tool, flags, env) {
  const res = spawnSync("codebase-memory-mcp", ["cli", tool, ...flags], {
    env,
    encoding: "utf8",
    timeout: 60_000,
  });
  const lines = `${res.stdout ?? ""}`.split("\n").map((s) => s.trim()).filter(Boolean);
  for (const l of lines.reverse()) {
    if (l.startsWith("{")) {
      try {
        return JSON.parse(l);
      } catch {
        /* keep scanning */
      }
    }
  }
  return null;
}

function stageFixture() {
  const dir = mkdtempSync(join(tmpdir(), "scrooge-headless-"));
  cpSync(FIXTURE, dir, { recursive: true });
  return dir;
}

function gitInit(dir) {
  const git = (...a) => spawnSync("git", a, { cwd: dir, stdio: "ignore", timeout: 15_000 });
  git("init", "-q");
  git("add", "-A");
  git("-c", "user.email=test@scrooge.kit", "-c", "user.name=scrooge", "commit", "-q", "-m", "init");
  writeFileSync(join(dir, "scratch.txt"), "work in progress\n"); // so `git status` has content
}

// ---------------- Layer A ----------------

function layerA() {
  log("\n── Layer A — harness-verified (deterministic) ──");

  log("  hook contract — decision hosts (deny-nudge + explicit allow):");
  for (const d of ["antigravity", "grok"]) {
    const noop = pipeHook(d, "ls -la");
    hard(noop.decision === "allow", `${d}: non-dev command → explicit allow`, JSON.stringify(noop));
    const dev = pipeHook(d, "git status");
    hard(
      dev.decision === "deny" && /rtk git status/.test(dev.reason || ""),
      `${d}: git status → deny-nudge with rtk`,
      JSON.stringify(dev),
    );
  }

  log("  hook contract — mutating hosts (silent rewrite + {} no-op):");
  for (const d of ["claude-code", "codex"]) {
    const dev = pipeHook(d, "git status");
    hard(
      dev.hookSpecificOutput?.updatedInput?.command === "rtk git status",
      `${d}: git status → silent updatedInput rewrite`,
      JSON.stringify(dev),
    );
    const noop = pipeHook(d, "ls -la");
    hard(Object.keys(noop).length === 0, `${d}: non-dev command → bare {}`, JSON.stringify(noop));
  }

  log("  MCP bundled + enabled (Headroom + codebase-memory):");
  for (const rel of [
    "plugins/claude-code/.mcp.json",
    "plugins/grok/.mcp.json",
    "plugins/antigravity/mcp_config.json",
  ]) {
    let s;
    try {
      s = JSON.parse(readFileSync(join(ROOT, rel), "utf8")).mcpServers;
    } catch {
      s = null;
    }
    const cm = s && s["codebase-memory"];
    const ok = !!s && s.headroom && cm && !s.headroom.disabled && !cm.disabled &&
      cm.command === "codebase-memory-mcp";
    hard(ok, `${rel}: headroom + codebase-memory present and enabled`);
  }

  log("  binaries (soft — savings need these, but the kit is fail-open without them):");
  for (const [bin, fix] of [
    ["rtk", "brew install rtk"],
    ["headroom", 'pip install "headroom-ai[all]"'],
    ["codebase-memory-mcp", "npm install -g codebase-memory-mcp"],
  ]) {
    soft(which(bin), `${bin} on PATH`, `missing → ${fix}`);
  }

  log("  codebase-memory code navigation on the polyglot fixture (deterministic):");
  if (!which("codebase-memory-mcp")) {
    soft(false, "codebase-memory-mcp not on PATH — skipping code-nav check", "npm install -g codebase-memory-mcp");
    return;
  }
  const dir = stageFixture();
  const cache = join(dir, ".cbm-cache");
  const env = { ...process.env, CBM_CACHE_DIR: cache };
  try {
    const idx = cbmCli("index_repository", ["--repo-path", dir, "--name", "scroogecheck"], env);
    hard(idx?.status === "indexed", "codebase-memory: index the polyglot fixture (Go + JS)", JSON.stringify(idx));
    for (const { name, expect, callsite } of SYMBOLS) {
      const t = cbmCli(
        "trace_path",
        ["--project", "scroogecheck", "--function-name", name, "--direction", "inbound"],
        env,
      );
      const hit = (t?.callers ?? []).some((c) =>
        `${c.name} ${c.qualified_name ?? ""}`.toLowerCase().includes(expect),
      );
      hard(hit, `codebase-memory: ${name} references resolve to ${callsite}`, JSON.stringify(t));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------- Layer B ----------------

function agentArgv(agent, dir, prompt) {
  if (agent === "agy") {
    return ["agy", "-p", prompt, "--add-dir", dir, "--dangerously-skip-permissions", "--print-timeout", "4m"];
  }
  return ["grok", "-p", prompt, "--always-approve"];
}

function runAgent(agent, dir, prompt) {
  const argv = agentArgv(agent, dir, prompt);
  // Isolate codebase-memory's cache per agent: agy and grok each spin up their own
  // MCP server, and without this they share the default cache dir — a race that
  // intermittently crashed agy's index_repository while grok indexed the same
  // fixture cleanly. A fixture-local cache dir removes the shared state.
  const env = { ...process.env, CBM_CACHE_DIR: join(dir, ".cbm-cache") };
  const res = spawnSync(argv[0], argv.slice(1), { cwd: dir, env, encoding: "utf8", timeout: 6 * 60_000 });
  return { out: `${res.stdout ?? ""}\n${res.stderr ?? ""}`, timedOut: res.error?.code === "ETIMEDOUT", err: res.error };
}

// Best-effort markers over agent prose — ADVISORY only. Prose is unreliable
// (agents both under- and over-claim), so these hint; the deterministic proof is
// Layer A. Tightened after the first live runs to kill two miscalibrations:
//   • false-green: an agent explaining a MISSING Headroom binary ("headroom … not
//     installed") matched the old `/headroom/ && /stats/` marker. Now a roundtrip
//     requires a real content hash + compress/retrieve verbs AND no "unavailable".
//   • false-negative: grok writing "FAIL не отмечен" (nav PASSED) tripped the old
//     `\bFAIL\b` nav-failure signature. Now failure keys on real crash/empty signals.
function markers(out) {
  const headroomAvail = /headroom/i.test(out) &&
    !/headroom[^\n]{0,40}(недоступ|not available|не установлен|not installed)/i.test(out);
  const headroomHash = /\b[0-9a-f]{16,}\b/i.test(out);
  const headroomVerbs = /(retriev|восстанов|compress|сжал|распак|stats)/i.test(out);
  const navResolved =
    /main\.go/i.test(out) && /index\.mjs/i.test(out) &&
    /(PASS|resolved|разрешил|референс|caller|inbound)/i.test(out);
  const navFail =
    /(index_repository|trace_path|search_graph)/i.test(out) &&
    /(worker crashed|exit_nonzero|not indexed|project not found|empty references|пуст[ыо][^\n]{0,20}референс|нет референс)/i.test(out);
  return {
    rtkDenyNudge:
      /deny-nudge/i.test(out) || /rtk git status/i.test(out) || /\[scrooge-kit\]/i.test(out) ||
      (/(заблокир|blocked)/i.test(out) && /rtk/i.test(out)),
    headroomRoundtrip: headroomAvail && headroomHash && headroomVerbs,
    navFail,
    navOk: !navFail && navResolved,
  };
}

// Per-host rtk expectation. grok does NOT execute plugin PreToolUse hooks in
// headless (`grok -p`) — proven upstream limitation (our hook format matches
// grok's docs and a minimal control plugin also failed to fire), so rtk cannot
// deny-nudge under the harness there. Reported as a note, never a pass/fail.
const RTK_KNOWN_LIMITATION = {
  grok: "grok does not run plugin PreToolUse hooks in headless (-p) — upstream; rtk deny-nudge can't fire here (works interactively / in agy).",
};

function layerB() {
  log("\n── Layer B — agent-driven headless (best-effort, spends tokens) ──");
  if (NO_AGENTS) {
    log("   (skipped: --no-agents)");
    return;
  }
  const agents = ["agy", "grok"].filter(which);
  if (agents.length === 0) {
    log("   (no agy/grok CLI on PATH — skipped)");
    return;
  }
  for (const agent of agents) {
    const dir = stageFixture();
    gitInit(dir);
    try {
      log(`\n  ▸ ${agent} (fixture: ${dir})`);
      const { out, timedOut, err } = runAgent(agent, dir, PROMPT);
      if (err && !timedOut) soft(false, `${agent}: invocation error`, String(err.message || err.code));
      if (timedOut) soft(false, `${agent}: timed out (6m)`);
      const m = markers(out);
      if (RTK_KNOWN_LIMITATION[agent]) {
        log(`   note ${agent}: rtk deny-nudge not expected — ${RTK_KNOWN_LIMITATION[agent]}`);
      } else {
        soft(m.rtkDenyNudge, `${agent}: rtk deny-nudge observed`);
      }
      soft(m.headroomRoundtrip, `${agent}: Headroom roundtrip observed`);
      if (m.navFail) soft(false, `${agent}: code-nav reported empty/failed references`);
      else soft(m.navOk, `${agent}: codebase-memory resolved refs (main.go + index.mjs)`);
      const tail = out.trim().split("\n").slice(-40).join("\n");
      log("    ---- transcript tail ----");
      log(tail.replace(/^/gm, "    | "));
      log("    -------------------------");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}

// ---------------- run ----------------

log("Scrooge Kit — headless integration check");
layerA();
layerB();

log(`\n${hardFail ? "❌ Layer A had hard failures" : "✅ Layer A passed"}${NO_AGENTS ? "" : " · Layer B is advisory (calibrate markers from transcript tails)"}`);
process.exit(hardFail ? 1 : 0);
