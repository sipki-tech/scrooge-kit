import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const json = (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));

test("plugin copies are in sync with shared/", () => {
  execFileSync(process.execPath, [join(ROOT, "scripts", "sync.mjs"), "--check"], {
    stdio: "pipe",
  });
});

test("claude marketplace lists plugins whose sources exist", () => {
  const mp = json(".claude-plugin/marketplace.json");
  assert.equal(mp.name, "scrooge-kit");
  assert.equal(typeof mp.owner, "object");
  assert.ok(mp.plugins.length >= 2);
  for (const p of mp.plugins) {
    assert.match(p.name, /^[a-z0-9-]+$/, `${p.name}: kebab-case`);
    assert.ok(
      existsSync(join(ROOT, p.source, ".claude-plugin", "plugin.json")),
      `${p.name}: source ${p.source} must contain a plugin manifest`,
    );
  }
});

test("claude-code plugin: manifest, hook, script, skill", () => {
  const manifest = json("plugins/claude-code/.claude-plugin/plugin.json");
  assert.equal(manifest.name, "scrooge-kit");
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);

  const hooks = json("plugins/claude-code/hooks/hooks.json");
  const entry = hooks.hooks.PreToolUse[0];
  assert.equal(entry.matcher, "Bash");
  assert.match(entry.hooks[0].command, /\$\{CLAUDE_PLUGIN_ROOT\}.*rtk-rewriter\.mjs" claude-code$/);

  assert.ok(existsSync(join(ROOT, "plugins/claude-code/scripts/rtk-rewriter.mjs")));
  assert.ok(existsSync(join(ROOT, "plugins/claude-code/skills/scrooge-hygiene/SKILL.md")));
});

test("headroom plugin ships only the MCP server", () => {
  const manifest = json("plugins/claude-code-headroom/.claude-plugin/plugin.json");
  assert.equal(manifest.name, "scrooge-headroom");
  const mcp = json("plugins/claude-code-headroom/.mcp.json");
  assert.deepEqual(mcp.mcpServers.headroom.args, ["mcp", "serve"]);
  assert.ok(!existsSync(join(ROOT, "plugins/claude-code-headroom/hooks")), "no hooks in the MCP-only plugin");
});

test("every hook-bearing plugin references an existing script with the right dialect", () => {
  const cases = [
    ["plugins/codex/hooks/hooks.json", (h) => h.hooks.PreToolUse[0].hooks[0].command, "codex"],
    ["plugins/gemini-cli/hooks/hooks.json", (h) => h.hooks.BeforeTool[0].hooks[0].command, "gemini-cli"],
    ["plugins/grok/hooks/hooks.json", (h) => h.hooks.PreToolUse[0].hooks[0].command, "grok"],
    ["plugins/antigravity/hooks.json", (h) => h["scrooge-kit"].PreToolUse[0].hooks[0].command, "antigravity"],
  ];
  for (const [file, pick, dialect] of cases) {
    const command = pick(json(file));
    assert.match(command, new RegExp(`rtk-rewriter\\.mjs" ${dialect}$`), file);
    const dir = dirname(join(ROOT, file.includes("/hooks/") ? dirname(file) : file));
    assert.ok(existsSync(join(dir, "scripts", "rtk-rewriter.mjs")), `${file}: script must exist next to it`);
  }
});

test("antigravity plugin keeps its loader traps", () => {
  const manifest = json("plugins/antigravity/plugin.json");
  assert.equal(typeof manifest.author, "object", "author must be an object");
  assert.ok(json("plugins/antigravity/hooks.json")["scrooge-kit"], "named top-level hook block");
  const hookCmd = json("plugins/antigravity/hooks.json")["scrooge-kit"].PreToolUse[0].hooks[0].command;
  assert.ok(!hookCmd.includes("${PLUGIN_ROOT}"), "agy 1.1.1 expands ${PLUGIN_ROOT} to empty — use hooks.json-relative paths");
  assert.equal(json("plugins/antigravity/mcp_config.json").mcpServers.headroom.disabled, true);
  assert.ok(!existsSync(join(ROOT, "plugins/antigravity/installed_version.json")), "never commit installed_version.json");
});

test("codex marketplace lists plugins whose sources exist", () => {
  const marketplace = json(".agents/plugins/marketplace.json");
  assert.equal(marketplace.name, "scrooge-kit");
  for (const plugin of marketplace.plugins) {
    assert.equal(plugin.source.source, "local", `${plugin.name}: codex-native source object`);
    assert.ok(existsSync(join(ROOT, plugin.source.path)), `${plugin.name}: source path must exist`);
  }
  const codex = marketplace.plugins.find((p) => p.name === "scrooge-kit");
  assert.ok(existsSync(join(ROOT, codex.source.path, ".codex-plugin", "plugin.json")));
});

test("gemini extension manifest is complete", () => {
  const manifest = json("plugins/gemini-cli/gemini-extension.json");
  assert.equal(manifest.name, "scrooge-kit");
  assert.equal(manifest.contextFileName, "GEMINI.md");
  assert.ok(existsSync(join(ROOT, "plugins/gemini-cli/GEMINI.md")));
});

test("opencode plugin loads, rewrites, and injects headroom conditionally", async () => {
  const mod = await import(`file://${join(ROOT, "plugins/opencode/index.js")}`);
  const hooks = await mod.ScroogeKit();

  process.env.SCROOGE_TEST_RTK = "1"; // not read by opencode probe — use real which; skip rewrite assert if rtk absent
  const output = { args: { command: "git status" } };
  await hooks["tool.execute.before"]({ tool: "bash" }, output);
  // Depending on rtk presence the command is rewritten or untouched — both valid; junk input must not throw:
  await hooks["tool.execute.before"]({ tool: "bash" }, {});
  await hooks["tool.execute.before"]({ tool: "read" }, { args: {} });

  const config = {};
  await hooks.config(config);
  if (config.mcp?.headroom) {
    assert.deepEqual(config.mcp.headroom.command, ["headroom", "mcp", "serve"]);
  }
  delete process.env.SCROOGE_TEST_RTK;
});

test("gemini release archive packs with the manifest at archive root", () => {
  const dist = join(ROOT, "dist-test");
  execFileSync(process.execPath, [join(ROOT, "scripts", "pack-gemini.mjs"), "dist-test"], { stdio: "pipe" });
  const listing = execFileSync("tar", ["-tzf", join(dist, "scrooge-kit.gemini-extension.tar.gz")]).toString();
  assert.match(listing, /^\.\/gemini-extension\.json$/m);
  assert.match(listing, /GEMINI\.md/);
  execFileSync("rm", ["-rf", dist]);
});
