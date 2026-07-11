import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJournal, readJson, readText } from "../core/fsutil.mjs";
import { ADAPTERS } from "../adapters/index.mjs";

const PAYLOAD = join(dirname(fileURLToPath(import.meta.url)), "..", "payload");

function freshHome() {
  return mkdtempSync(join(tmpdir(), "scrooge-test-"));
}

function ctx(home, { dryRun = false, headroomAvailable = false, opts = {} } = {}) {
  return {
    home,
    journal: createJournal(dryRun),
    payloadDir: PAYLOAD,
    version: "0.0.0-test",
    opts: { statusline: false, ...opts },
    headroomAvailable,
    log: () => {},
  };
}

// Adapters that only touch files (no exec steps) — safe for full
// install/uninstall round-trip against a temp home.
const FILE_ONLY = ["gemini-cli", "antigravity", "codex", "opencode", "grok", "cursor", "windsurf"];

test("dry-run records actions without writing", () => {
  for (const name of FILE_ONLY) {
    const home = freshHome();
    const c = ctx(home, { dryRun: true });
    ADAPTERS[name].install(c);
    assert.ok(c.journal.actions.length > 0, `${name}: expected journal actions`);
    // Nothing outside the pre-existing temp dir root may appear.
    for (const sub of [".gemini", ".codex", ".config", ".grok", ".cursor", ".codeium"]) {
      assert.ok(!existsSync(join(home, sub)), `${name}: dry-run wrote ${sub}`);
    }
    rmSync(home, { recursive: true, force: true });
  }
});

test("install → verify passes → uninstall leaves no trace", () => {
  for (const name of FILE_ONLY) {
    const home = freshHome();
    ADAPTERS[name].install(ctx(home));
    const checks = ADAPTERS[name].verify(ctx(home, { dryRun: true }));
    for (const c of checks) assert.ok(c.pass, `${name}: verify failed — ${c.name}`);

    ADAPTERS[name].uninstall(ctx(home));
    const after = ADAPTERS[name].verify(ctx(home, { dryRun: true }));
    for (const c of after) assert.ok(!c.pass, `${name}: '${c.name}' survived uninstall`);
    rmSync(home, { recursive: true, force: true });
  }
});

test("codex: marker block append/remove preserves user config", () => {
  const home = freshHome();
  const file = join(home, ".codex", "config.toml");
  mkdirSync(dirname(file), { recursive: true });
  const userToml = '[model]\nname = "o5"\n';
  writeFileSync(file, userToml);

  ADAPTERS.codex.install(ctx(home, { headroomAvailable: true }));
  const withBlock = readFileSync(file, "utf8");
  assert.ok(withBlock.startsWith(userToml), "user config must stay first");
  assert.match(withBlock, /\[\[hooks\.PreToolUse\]\]/);
  assert.match(withBlock, /\[mcp_servers\.headroom\]/);

  // Re-install must not duplicate the block.
  ADAPTERS.codex.install(ctx(home, { headroomAvailable: true }));
  assert.equal(readFileSync(file, "utf8"), withBlock);

  ADAPTERS.codex.uninstall(ctx(home));
  assert.equal(readFileSync(file, "utf8").includes("scrooge-kit"), false);
  assert.ok(readFileSync(file, "utf8").includes(userToml.trim()));
  rmSync(home, { recursive: true, force: true });
});

test("grok: merge keeps user hooks and MCP servers", () => {
  const home = freshHome();
  const file = join(home, ".grok", "settings.json");
  mkdirSync(dirname(file), { recursive: true });
  const userSettings = {
    hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "my-guard" }] }] },
    mcpServers: { mine: { command: "mine" } },
  };
  writeFileSync(file, JSON.stringify(userSettings));

  ADAPTERS.grok.install(ctx(home, { headroomAvailable: true }));
  const merged = readJson(file);
  assert.equal(merged.hooks.PreToolUse.length, 2);
  assert.equal(merged.hooks.PreToolUse[0].hooks[0].command, "my-guard");
  assert.ok(merged.mcpServers.mine);
  assert.ok(merged.mcpServers.headroom);

  ADAPTERS.grok.uninstall(ctx(home));
  const after = readJson(file);
  assert.equal(after.hooks.PreToolUse.length, 1);
  assert.ok(after.mcpServers.mine);
  assert.equal(after.mcpServers.headroom, undefined);
  rmSync(home, { recursive: true, force: true });
});

test("antigravity: user-edited headroom MCP entry survives uninstall", () => {
  const home = freshHome();
  const mcpFile = join(home, ".gemini", "config", "mcp_config.json");
  mkdirSync(dirname(mcpFile), { recursive: true });
  writeFileSync(
    mcpFile,
    JSON.stringify({ mcpServers: { headroom: { command: "headroom", args: ["mcp", "--port", "9"] } } }),
  );
  ADAPTERS.antigravity.install(ctx(home));
  ADAPTERS.antigravity.uninstall(ctx(home));
  assert.ok(readJson(mcpFile).mcpServers.headroom, "user-edited entry must survive");
  rmSync(home, { recursive: true, force: true });
});

test("opencode: generated plugin parses and headroom entry merges", async () => {
  const home = freshHome();
  ADAPTERS.opencode.install(ctx(home, { headroomAvailable: true }));
  const pluginFile = join(home, ".config", "opencode", "plugin", "scrooge-kit.js");
  const mod = await import(`file://${pluginFile}`);
  const hooks = await mod.ScroogeKit();
  assert.equal(typeof hooks["tool.execute.before"], "function");
  // fail-open: junk input must not throw
  await hooks["tool.execute.before"]({ tool: "bash" }, {});
  assert.ok(readJson(join(home, ".config", "opencode", "opencode.json")).mcp.headroom);
  rmSync(home, { recursive: true, force: true });
});

test("windsurf: rules append/strip round-trip keeps user rules", () => {
  const home = freshHome();
  const rules = join(home, ".codeium", "windsurf", "memories", "global_rules.md");
  mkdirSync(dirname(rules), { recursive: true });
  writeFileSync(rules, "# my rules\nalways be nice\n");
  ADAPTERS.windsurf.install(ctx(home));
  assert.match(readText(rules), /scrooge-kit/);
  ADAPTERS.windsurf.uninstall(ctx(home));
  const after = readText(rules);
  assert.ok(after.includes("always be nice"));
  assert.ok(!after.includes("scrooge-kit"));
  rmSync(home, { recursive: true, force: true });
});

test("claude-code: hook + statusline merge into existing settings (no exec)", () => {
  const home = freshHome();
  const file = join(home, ".claude", "settings.json");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ model: "opus", hooks: { Stop: [{ hooks: [] }] } }));

  // headroomAvailable=false so the adapter takes no exec steps.
  ADAPTERS["claude-code"].install(ctx(home, { opts: { statusline: true } }));
  const settings = readJson(file);
  assert.equal(settings.model, "opus");
  assert.ok(settings.hooks.Stop, "user hooks preserved");
  assert.match(JSON.stringify(settings.hooks.PreToolUse), /scrooge-kit/);
  assert.ok(settings.statusLine.command.includes("ccusage"));
  assert.ok(existsSync(join(home, ".claude", "skills", "scrooge-hygiene", "SKILL.md")));

  ADAPTERS["claude-code"].uninstall(ctx(home));
  const after = readJson(file);
  assert.equal(after.model, "opus");
  assert.equal(after.hooks.PreToolUse, undefined);
  assert.equal(after.statusLine, undefined);
  assert.ok(!existsSync(join(home, ".claude", "skills", "scrooge-hygiene")));
  rmSync(home, { recursive: true, force: true });
});

test("claude-code: pre-existing statusline is never touched", () => {
  const home = freshHome();
  const file = join(home, ".claude", "settings.json");
  mkdirSync(dirname(file), { recursive: true });
  const mine = { type: "command", command: "my-statusline" };
  writeFileSync(file, JSON.stringify({ statusLine: mine }));
  ADAPTERS["claude-code"].install(ctx(home, { opts: { statusline: true } }));
  assert.deepEqual(readJson(file).statusLine, mine);
  ADAPTERS["claude-code"].uninstall(ctx(home));
  assert.deepEqual(readJson(file).statusLine, mine);
  rmSync(home, { recursive: true, force: true });
});
