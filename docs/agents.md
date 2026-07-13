# Per-agent integration notes

Confidence as of 2026-07-13: **[verified]** — exercised live against the real CLI on this date; **[best-effort]** — mirrors a documented pattern, fail-open if the host ignores it; **[pending]** — blocked on an external step, see the note.

## Verification matrix (live, 2026-07-13)

| Agent | CLI | Install (proven) | Load proof | Uninstall (proven) | Verdict |
|---|---|---|---|---|---|
| claude-code | claude 2.1.197 | `claude plugin marketplace add …` → `claude plugin install scrooge-kit@scrooge-kit` | live session: `git status` rewritten to `rtk git status`; skill + headroom MCP visible | `claude plugin uninstall …` | ✅ native |
| codex | codex 0.144.1 | `codex plugin marketplace add sipki-tech/scrooge-kit` → `codex plugin add scrooge-kit@scrooge-kit` (local + remote both exercised) | `codex plugin list` → installed, enabled, resolves `plugins/codex` via `.agents/plugins/marketplace.json` | `codex plugin remove scrooge-kit@scrooge-kit` | ✅ native |
| gemini-cli | gemini 1.17.18 | `gemini extensions install <repo-url>` — confirmed it pulls the v0.2.0 release archive (`Type: github-release`); local path install also exercised | `gemini extensions list` shows extension + skill registered | `gemini extensions uninstall scrooge-kit` | ✅ native |
| antigravity | agy 1.1.1 | `agy plugin install ./scrooge-kit/plugins/antigravity` (local dir after clone) | cli.log: `Loaded hooks.json from ~/.gemini/config/plugins/scrooge-kit/hooks.json: 1 named hooks`; handler exercised from installed cwd | `agy plugin uninstall scrooge-kit` | ✅ native (no remote one-liner — see trap) |
| grok | grok 0.2.93 | `grok plugin install sipki-tech/scrooge-kit#plugins/grok` (remote subdir + local path both exercised) | `grok plugin list` / `details` show scrooge-kit v0.2.0, skills + hooks components | `grok plugin uninstall scrooge-kit` | ✅ native |
| opencode | opencode | `opencode plugin @sipki-tech/scrooge-kit-opencode` | module import + hooks exercised in-process | remove the `opencode.json` entry | 🟡 pending npm publish |

## How we verify nativeness

Plugin systems of these agents are young and change fast; re-run this whenever a CLI updates:

1. `npm run smoke` — for every agent CLI found on the machine, runs the **real native install/list/uninstall** inside a disposable sandbox (`HOME` / `CLAUDE_CONFIG_DIR` / `CODEX_HOME` redirected to a temp dir). Real user config is fingerprinted before and restored if anything drifts. Exit 1 on any failure or drift.
2. Load proofs beyond install: Claude Code — run a bare dev command in a live session and see the `rtk` rewrite; Antigravity — `grep "Loaded hooks.json" ~/.gemini/antigravity-cli/cli.log` after a session starts; Gemini/Grok/Codex — the list/details output names the plugin, version, and components.
3. Remote paths are tested against the public GitHub repo (marketplace add / `#subdir` / release archive), local paths against the working tree.
4. Any command that cannot be proven this way is documented as a gap, not claimed.

## claude-code [verified]
- Native plugin `plugins/claude-code/` + marketplace at repo root. PreToolUse hook (matcher `Bash`) rewrites via `hookSpecificOutput.updatedInput`; script referenced through `${CLAUDE_PLUGIN_ROOT}`.
- Headroom is the separate `scrooge-headroom` plugin: Claude Code plugin MCP servers cannot ship disabled, so it must only be installed when the binary exists.

## codex [verified]
- `plugins/codex/` with `.codex-plugin/plugin.json`; native PreToolUse hooks since ~v0.144, `PLUGIN_ROOT` env with a `CLAUDE_PLUGIN_ROOT` alias (we use the alias for one shared hooks format). Matcher covers `shell|local_shell|exec_command|Bash`.
- The repo ships the Codex-native marketplace at `.agents/plugins/marketplace.json` (object sources → `plugins/codex` and `plugins/claude-code-headroom`); Codex prefers it over the legacy `.claude-plugin/marketplace.json`, which older snapshots still resolve (they get the claude-code plugin — functionally equivalent).
- Full cycle proven on 0.144.1: `codex plugin marketplace add` (local path and `owner/repo`), `codex plugin add scrooge-kit@scrooge-kit`, `list`, `remove`.

## gemini-cli [verified]
- `plugins/gemini-cli/` is a Gemini extension (`gemini-extension.json`, `contextFileName: GEMINI.md`). Hook event is **`BeforeTool`** with matcher `run_shell_command`; script path via `${extensionPath}`.
- Remote install proven: `gemini extensions install https://github.com/sipki-tech/scrooge-kit` resolved the `scrooge-kit.gemini-extension.tar.gz` asset of release v0.2.0 (`Type: github-release`) — the archive is built by `scripts/pack-gemini.mjs` and attached by the release workflow, because `gemini-extension.json` is not at the repo root. Local dev: `gemini extensions link ./plugins/gemini-cli`.
- Two prompts at install time: `--consent` covers the extension-risk prompt; the folder-trust prompt still reads stdin (the smoke test feeds it `y`).
- The rewriter answers in the Claude-style `hookSpecificOutput.updatedInput` dialect; if a build doesn't support input rewriting, the original command runs (fail-open).

## antigravity [verified]
- `plugins/antigravity/`: `plugin.json` (object `author`), root-level `hooks.json` with the named top-level block, `mcp_config.json` with headroom `"disabled": true` (agy supports the flag), rules/, skills/, scripts/.
- **Hook command uses a hooks.json-relative path** (`node "scripts/rtk-rewriter.mjs" antigravity`): agy 1.1.1 expands `${PLUGIN_ROOT}` to an empty string, and the handler cwd is the hooks.json directory. A test guards against reintroducing the variable.
- Install: `agy plugin install ./scrooge-kit/plugins/antigravity` (local path after clone). **Bulk trap:** pointing `agy plugin install` at the repo URL installs every directory under `plugins/` — all six agent payloads — so there is deliberately no remote one-liner. No `agy plugin update` either: update = pull + re-install. `installed_version.json` is written by the plugin manager — never committed (test + smoke guard).
- Load proven: `agy plugin list` registers it (`~/.gemini/config/import_manifest.json`), cli.log logs `Loaded hooks.json … 1 named hooks, 1 total handlers` when a session starts.
- Rewriter runs the **deny-nudge** dialect: arg mutation is unverified on this host, so the deny reason carries the exact `rtk`-prefixed command.

## grok [verified]
- `plugins/grok/` is a Claude-compatible plugin dir with its own `.claude-plugin/plugin.json` (without a manifest grok generates a hash name like `grok-6aeab4a5` and `uninstall scrooge-kit` fails); hooks/hooks.json + skills + scripts, path var `${GROK_PLUGIN_ROOT}`.
- Primary install (proven): `grok plugin install sipki-tech/scrooge-kit#plugins/grok` — subdir syntax straight from the repo. `grok plugin marketplace add sipki-tech/scrooge-kit` also works and reads the Claude marketplace, but resolves `plugins/claude-code` (Claude dialect, `${CLAUDE_PLUGIN_ROOT}`) — the subdir install of the dedicated plugin is preferred.
- `grok plugin validate ./plugins/grok` reports name, version, and components (skills + hooks).

## opencode [pending npm publish]
- `plugins/opencode/` is the npm package `@sipki-tech/scrooge-kit-opencode`: `tool.execute.before` mutates bash args in-process; the `config` hook registers headroom MCP only when the binary is present.
- Native install is OpenCode's own `opencode plugin @sipki-tech/scrooge-kit-opencode` (writes `opencode.json` itself; `-g` for global). Works once the package is published: `cd plugins/opencode && npm publish --access public`. The smoke test probes npm and exercises the real install when the package resolves; until then it validates the module in-process and reports PARTIAL.

## Shared source

`shared/` is the single source of truth (policy, rewriter, io, skill, rules); `scripts/sync.mjs` distributes it into every plugin and `test/plugins.test.mjs` fails if any committed copy drifts. Hook wire dialects live in `shared/scripts/rtk-rewriter.mjs` (argv[2]: `claude-code`/`codex`/`gemini-cli`/`grok` → updatedInput; `antigravity` → deny-nudge).
