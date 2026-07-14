# Per-agent integration notes

Confidence as of 2026-07-13: **[verified]** — exercised live against the real CLI on this date; **[best-effort]** — mirrors a documented pattern, fail-open if the host ignores it; **[pending]** — blocked on an external step, see the note.

> **Headless verification 2026-07-15 (v0.5):** ground-truth results from `scripts/headless-check.mjs` + targeted probes.
> **rtk hook fires live** on **antigravity** (deny-nudge blocks a bare `git status`) and **claude-code** (bare `git status` returns rtk-compressed output). **grok is a known limitation:** grok does **not** execute plugin `PreToolUse` hooks in headless (`grok -p`), so rtk cannot deny-nudge there — proven by a marker side-effect on the real hook (installed copy confirmed synced, no marker on the tool call) and reproduced with a minimal doc-perfect control plugin that also never fired. Our hook format matches grok's own docs (`~/.grok/docs/user-guide/10-hooks.md`) and 4 marketplace plugins, and `--trust` / non-yolo don't change it, so this is upstream, not a kit defect; it is **fail-open** (grok just misses compression — skill + MCP still work). Interactive grok not yet confirmed. **codex** and **opencode** have no local install yet — live rtk re-verify deferred to post-publish. Their config/contract is Layer-A green.
>
> **Revised 2026-07-14 (v0.5):** the Serena MCP (symbol retrieval over per-language LSP) is replaced by **codebase-memory-mcp** — a single static binary that indexes 158 languages (tree-sitter + hybrid LSP for 12) with zero per-language setup and native polyglot/monorepo support. It removes Serena's single-language auto-detect and per-project `.serena/project.yml` friction. Install: `npm install -g codebase-memory-mcp`. Bundled MCP entry per host: `{"command":"codebase-memory-mcp"}`.
>
> **Revised 2026-07-14 (v0.4):** three design changes supersede parts of the live matrix below and need re-verification on the real CLIs: (1) Grok joins Antigravity on the **deny-nudge** dialect — its hook contract has no arg-mutation slot, so the old `updatedInput` mirror was silently dropped; (2) Headroom + codebase-memory MCP are **bundled into each main plugin and ship enabled** (a missing binary is a visible connection error, per an explicit product decision) — the separate `scrooge-headroom` / `scrooge-serena` plugins are gone; (3) the **Gemini CLI** target was removed from the kit.

## Verification matrix (live, 2026-07-13)

| Agent | CLI | Install (proven) | Load proof | Uninstall (proven) | Verdict |
|---|---|---|---|---|---|
| claude-code | claude 2.1.197 | `claude plugin marketplace add …` → `claude plugin install scrooge-kit@scrooge-kit` | live session: `git status` rewritten to `rtk git status`; skill + bundled Headroom/codebase-memory MCP visible | `claude plugin uninstall …` | ✅ native |
| codex | codex 0.144.1 | `codex plugin marketplace add sipki-tech/scrooge-kit` → `codex plugin add scrooge-kit@scrooge-kit` (local + remote both exercised) | `codex plugin list` → installed, enabled, resolves `plugins/codex` via `.agents/plugins/marketplace.json` | `codex plugin remove scrooge-kit@scrooge-kit` | ✅ native |
| antigravity | agy 1.1.1 | `agy plugin install ./scrooge-kit/plugins/antigravity` (local dir after clone) | cli.log: `Loaded hooks.json from ~/.gemini/config/plugins/scrooge-kit/hooks.json: 1 named hooks`; handler exercised from installed cwd | `agy plugin uninstall scrooge-kit` | ✅ native (no remote one-liner — see trap) |
| grok | grok 0.2.101 | `grok plugin install sipki-tech/scrooge-kit#plugins/grok` (remote subdir + local path both exercised) | `grok plugin list` / `details` show scrooge-kit, skills + hooks components | `grok plugin uninstall scrooge-kit` | ✅ native for skill + MCP; ⚠️ rtk hook does not fire in headless (upstream, see §grok) |
| opencode | opencode | `opencode plugin @sipki-tech/scrooge-kit-opencode` | module import + hooks exercised in-process | remove the `opencode.json` entry | 🟡 pending npm publish |

## How we verify nativeness

Plugin systems of these agents are young and change fast; re-run this whenever a CLI updates:

1. `npm run smoke` — for every agent CLI found on the machine, runs the **real native install/list/uninstall** inside a disposable sandbox (`HOME` / `CLAUDE_CONFIG_DIR` / `CODEX_HOME` redirected to a temp dir). Real user config is fingerprinted before and restored if anything drifts. Exit 1 on any failure or drift.
2. Load proofs beyond install: Claude Code — run a bare dev command in a live session and see the `rtk` rewrite; Antigravity/Grok — run a bare dev command and see the deny-nudge to `rtk …`, and run a non-dev command (`ls`) and confirm it is **not** blocked; Codex — the list output names the plugin, version, and components.
3. Remote paths are tested against the public GitHub repo (marketplace add / `#subdir` / release archive), local paths against the working tree.
4. Any command that cannot be proven this way is documented as a gap, not claimed.

## claude-code [verified]
- Native plugin `plugins/claude-code/` + marketplace at repo root. PreToolUse hook (matcher `Bash`) rewrites via `hookSpecificOutput.updatedInput`; script referenced through `${CLAUDE_PLUGIN_ROOT}`.
- Headroom + codebase-memory ship in the plugin's own `plugins/claude-code/.mcp.json` (auto-discovered on install), **enabled**. Claude Code cannot ship an MCP server disabled, so a missing binary surfaces as a one-line connection error — an accepted, documented trade for zero manual steps. Install the binaries to clear it: `headroom` via `pip install "headroom-ai[all]"`, `codebase-memory-mcp` via `npm install -g codebase-memory-mcp`.

## codex [verified]
- `plugins/codex/` with `.codex-plugin/plugin.json`; native PreToolUse hooks since ~v0.144, `PLUGIN_ROOT` env with a `CLAUDE_PLUGIN_ROOT` alias (we use the alias for one shared hooks format). Matcher covers `shell|local_shell|exec_command|Bash`.
- The repo ships the Codex-native marketplace at `.agents/plugins/marketplace.json` (object source → `plugins/codex`); Codex prefers it over the legacy `.claude-plugin/marketplace.json`, which older snapshots still resolve (they get the claude-code plugin — functionally equivalent).
- Codex is left on the mutating (`updatedInput`) dialect and its hook contract is not locally verified; if a future check shows it fail-closes on a bare `{}` no-op, add it to `DECISION_HOSTS` in `shared/scripts/rtk-rewriter.mjs`.
- Full cycle proven on 0.144.1: `codex plugin marketplace add` (local path and `owner/repo`), `codex plugin add scrooge-kit@scrooge-kit`, `list`, `remove`.

## antigravity [verified]
- `plugins/antigravity/`: `plugin.json` (object `author`), root-level `hooks.json` with the named top-level block, `mcp_config.json` with headroom and codebase-memory **enabled** (agy auto-loads plugin `mcp_config.json` on install; no `disabled` flag needed — a missing binary is a visible connection error, per the v0.4 product decision), rules/, skills/, scripts/.
- **Hook command uses a hooks.json-relative path** (`node "scripts/rtk-rewriter.mjs" antigravity`): agy 1.1.1 expands `${PLUGIN_ROOT}` to an empty string, and the handler cwd is the hooks.json directory. A test guards against reintroducing the variable.
- Install: `agy plugin install ./scrooge-kit/plugins/antigravity` (local path after clone). **Bulk trap:** pointing `agy plugin install` at the repo URL installs every directory under `plugins/` — all the agent payloads — so there is deliberately no remote one-liner. No `agy plugin update` either: update = pull + re-install. `installed_version.json` is written by the plugin manager — never committed (test + smoke guard).
- Load proven: `agy plugin list` registers it (`~/.gemini/config/import_manifest.json`), cli.log logs `Loaded hooks.json … 1 named hooks, 1 total handlers` when a session starts.
- Rewriter runs the **deny-nudge** dialect: agy's PreToolUse contract cannot mutate args (`overwrite … not yet implemented`, per its own hooks doc), so the deny reason carries the exact `rtk`-prefixed command. On a no-op the hook must return an explicit `{decision:"allow"}` — agy treats a bare `{}` (missing the required `decision`) as a **deny**, which previously blocked every non-dev command. Handled by `DECISION_HOSTS` / `allowFor()` in the rewriter.

## grok [verified]
- `plugins/grok/` is a Claude-compatible plugin dir with its own `.claude-plugin/plugin.json` (without a manifest grok generates a hash name like `grok-6aeab4a5` and `uninstall scrooge-kit` fails); hooks/hooks.json + skills + scripts, path var `${GROK_PLUGIN_ROOT}`.
- Primary install (proven): `grok plugin install sipki-tech/scrooge-kit#plugins/grok` — subdir syntax straight from the repo. `grok plugin marketplace add sipki-tech/scrooge-kit` also works and reads the Claude marketplace, but resolves `plugins/claude-code` (Claude dialect, `${CLAUDE_PLUGIN_ROOT}`) — the subdir install of the dedicated plugin is preferred.
- `grok plugin validate ./plugins/grok` reports name, version, and components (skills + hooks).
- **Deny-nudge dialect (v0.4):** Grok's PreToolUse contract only allows/denies/asks — there is no arg-mutation slot (`~/.grok/docs/user-guide/10-hooks.md`), so the old `updatedInput` mirror was silently dropped. Grok uses the same deny-nudge as Antigravity. Grok is fail-open on `{}`, so the no-op still returns an explicit allow for uniformity. Grok's stdin uses **camelCase** `toolInput` (not `tool_input`) and aliases `Bash → run_terminal_command`; `commandLineOf` probes both shapes.
- **Known limitation — rtk does not fire under `grok -p` headless (2026-07-15, grok 0.2.101):** proven by ground truth, not agent prose. Instrumenting the real hook with a marker side-effect (via the repo source, since grok re-syncs `Local` installs on launch — the installed copy was confirmed to carry the marker) showed **no marker written** when grok ran a bare `git status`, i.e. the `PreToolUse` hook is never invoked. A minimal doc-perfect control plugin (`matcher: "Bash"`) also never fired, so it is not our manifest. Ruled out: format (matches grok docs + marketplace plugins), matcher (`.*` also failed; `Bash → run_terminal_command` alias confirmed), trust (`--trust`), and yolo (docs: `--always-approve` does **not** bypass `PreToolUse`). Conclusion: upstream grok does not run plugin `PreToolUse` hooks in headless. **Fail-open** — grok loses rtk compression but skill + MCP work. Interactive grok is unconfirmed and may still fire hooks.
- Headroom + codebase-memory ship in `plugins/grok/.mcp.json` (Grok auto-discovers `.mcp.json`, `enabled` by default), same enabled-with-visible-error model as the other hosts.

## opencode [pending npm publish]
- `plugins/opencode/` is the npm package `@sipki-tech/scrooge-kit-opencode`: `tool.execute.before` mutates bash args in-process; the `config` hook registers the headroom and codebase-memory MCP servers only when the respective binary is present.
- Native install is OpenCode's own `opencode plugin @sipki-tech/scrooge-kit-opencode` (writes `opencode.json` itself; `-g` for global). Works once the package is published: `cd plugins/opencode && npm publish --access public`. The smoke test probes npm and exercises the real install when the package resolves; until then it validates the module in-process and reports PARTIAL.

## Shared source

`shared/` is the single source of truth (policy, rewriter, io, skill, rules); `scripts/sync.mjs` distributes it into every plugin and `test/plugins.test.mjs` fails if any committed copy drifts. Hook wire dialects live in `shared/scripts/rtk-rewriter.mjs` (argv[2]): mutating hosts `claude-code`/`codex` → `hookSpecificOutput.updatedInput` + `{}` no-op; decision hosts `antigravity`/`grok` (`DECISION_HOSTS`) → deny-nudge on a rewrite + explicit `{decision:"allow"}` no-op.
