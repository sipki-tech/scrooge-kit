# Per-agent integration notes

Confidence as of 2026-07: **[verified]** — official docs and/or exercised live; **[best-effort]** — mirrors a documented pattern, fail-open if the host ignores it; **[secondary]** — based on secondary sources, verify against the CLI on first use.

## claude-code [verified]
- Native plugin `plugins/claude-code/` + marketplace at repo root. PreToolUse hook (matcher `Bash`) rewrites via `hookSpecificOutput.updatedInput`; script referenced through `${CLAUDE_PLUGIN_ROOT}`.
- Headroom is the separate `scrooge-headroom` plugin: Claude Code plugin MCP servers cannot ship disabled, so it must only be installed when the binary exists.

## codex [best-effort]
- `plugins/codex/` with `.codex-plugin/plugin.json`; native PreToolUse hooks since ~v0.144, `PLUGIN_ROOT` env with a `CLAUDE_PLUGIN_ROOT` alias (we use the alias for one shared hooks format). Matcher covers `shell|local_shell|exec_command|Bash`.
- Codex also reads legacy `.claude-plugin/marketplace.json`, so `codex plugin marketplace add <repo-url>` + `codex plugin add scrooge-kit@scrooge-kit` may resolve the claude-code plugin instead — functionally equivalent.

## gemini-cli [best-effort]
- `plugins/gemini-cli/` is a Gemini extension (`gemini-extension.json`, `contextFileName: GEMINI.md`). Hook event is **`BeforeTool`** with matcher `run_shell_command`; script path via `${extensionPath}`.
- Remote install needs the release archive (`scrooge-kit.gemini-extension.tar.gz`, built by `scripts/pack-gemini.mjs`, attached by the release workflow) because `gemini extensions install` has no subdirectory flag. Local dev: `gemini extensions link ./plugins/gemini-cli`.
- The rewriter answers in the Claude-style `hookSpecificOutput.updatedInput` dialect; if a build doesn't support input rewriting, the original command runs (fail-open).

## antigravity [verified via antigravity-kit traps; agy CLI syntax [secondary]]
- `plugins/antigravity/`: `plugin.json` (object `author`), root-level `hooks.json` with the named top-level block, `mcp_config.json` with headroom `"disabled": true` (agy supports the flag), rules/, skills/, scripts/.
- Install: `agy plugin install ./scrooge-kit/plugins/antigravity` (local path after clone; remote subdir install unconfirmed). `installed_version.json` is written by the plugin manager — never committed.
- Rewriter runs the **deny-nudge** dialect: arg mutation is unverified on this host, so the deny reason carries the exact `rtk`-prefixed command.

## grok [secondary]
- `plugins/grok/` is a manifest-less Claude-compatible plugin dir (hooks/hooks.json + skills + scripts), path var `${GROK_PLUGIN_ROOT}`.
- Grok Build reads Claude marketplaces (`grok plugin marketplace add sipki-tech/scrooge-kit`); manual fallback: copy to `~/.grok/plugins/scrooge-kit/`. Verify exact CLI against `grok plugin --help`.

## cursor [best-effort]
- `plugins/cursor/`: `.cursor-plugin/plugin.json` + always-applied rule `rules/token-hygiene.mdc` + skill. No hook: Cursor hooks gate/observe but don't rewrite, so the rule (agent prefixes `rtk` itself) is the mechanism.
- Public marketplace listing requires review — until then: team marketplace from this repo, or copy the .mdc into a project's `.cursor/rules/`.

## opencode [verified pattern]
- `plugins/opencode/` is the npm package `@sipki-tech/scrooge-kit-opencode`: `tool.execute.before` mutates bash args in-process; the `config` hook registers headroom MCP only when the binary is present. Publish with `npm publish --access public` from that directory.

## windsurf / devin [manual only]
- No plugin packaging exists; GUIDE §3 documents the manual rules + MCP setup. Target both `.windsurf/`/`~/.codeium/windsurf/` and `.devin/` path families.

## Shared source

`shared/` is the single source of truth (policy, rewriter, io, skill, rules); `scripts/sync.mjs` distributes it into every plugin and `test/plugins.test.mjs` fails if any committed copy drifts. Hook wire dialects live in `shared/scripts/rtk-rewriter.mjs` (argv[2]: `claude-code`/`codex`/`gemini-cli`/`grok` → updatedInput; `antigravity` → deny-nudge; `cursor` → allow+agent_message, currently unused).
