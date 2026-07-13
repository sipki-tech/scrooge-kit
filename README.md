<h1 align="center">Scrooge Kit</h1>

<table align="center">
<tr>
<td>
<pre><code>
███████╗ ██████╗██████╗  ██████╗  ██████╗  ██████╗ ███████╗
██╔════╝██╔════╝██╔══██╗██╔═══██╗██╔═══██╗██╔════╝ ██╔════╝
███████╗██║     ██████╔╝██║   ██║██║   ██║██║  ███╗█████╗
╚════██║██║     ██╔══██╗██║   ██║██║   ██║██║   ██║██╔══╝
███████║╚██████╗██║  ██║╚██████╔╝╚██████╔╝╚██████╔╝███████╗
╚══════╝ ╚═════╝╚═╝  ╚═╝ ╚═════╝  ╚═════╝  ╚═════╝ ╚══════╝
</code></pre>
</td>
</tr>
</table>

<p align="center">
  <img alt="native plugins" src="https://img.shields.io/badge/native%20plugins-6%20agents-5B8DEF?style=for-the-badge&labelColor=111827" />
  <img alt="token savings" src="https://img.shields.io/badge/terminal%20tokens-−60–90%25-F59E0B?style=for-the-badge&labelColor=111827" />
  <img alt="zero deps" src="https://img.shields.io/badge/dependencies-0-22C55E?style=for-the-badge&labelColor=111827" />
  <img alt="MIT license" src="https://img.shields.io/badge/license-MIT-64748B?style=for-the-badge&labelColor=111827" />
</p>

<p align="center">
  English | <a href="README.ru.md">Русский</a>
  &nbsp;·&nbsp; <a href="docs/GUIDE.md">📖 User Guide</a>
</p>

> Scrooge McDuck diving into a money bin of saved tokens.

**Scrooge Kit** is a set of **native plugins** — one per coding agent, all in this monorepo — that cut token spend with proven tools. No custom installer, no config patching: each agent installs the plugin through its own plugin manager.

```
terminal command output ──► [rtk: PreToolUse rewrite hook] ──► agent context  (−60–90% tokens)
big blobs / logs / files ──► [Headroom: MCP compress]      ──► LLM API        (−60–95% tokens)
```

- **[rtk](https://github.com/rtk-ai/rtk)** — the hook transparently rewrites `git status` → `rtk git status`; output enters the context compressed, failures intact.
- **[Headroom](https://github.com/headroomlabs-ai/headroom)** — reversible blob compression via MCP tools (`headroom_compress` / `headroom_retrieve` / `headroom_stats`).
- **[Serena](https://github.com/oraios/serena)** — symbol-level code retrieval/editing over LSP (40+ languages): the agent reads symbols and references instead of whole files.
- **scrooge-hygiene skill + rules** — selective reads, no raw logs, bypass etiquette.

Prerequisite for the savings: `brew install rtk` (hooks are silent no-ops without it); optionally `pip install "headroom-ai[all]"` and `uv tool install serena-agent`.

## Install (native, per agent)

Every command below is exercised against the real CLI — see [docs/agents.md](docs/agents.md) for the verification matrix and `npm run smoke` for the sandboxed re-check.

| Agent | Install |
|---|---|
| **Claude Code** | `/plugin marketplace add sipki-tech/scrooge-kit` → `/plugin install scrooge-kit@scrooge-kit` (+ `scrooge-headroom@scrooge-kit` / `scrooge-serena@scrooge-kit` if the respective binary is installed) |
| **Codex CLI** | `codex plugin marketplace add sipki-tech/scrooge-kit` → `codex plugin add scrooge-kit@scrooge-kit` (+ `scrooge-headroom` / `scrooge-serena` the same way) |
| **Grok Build** | `grok plugin install sipki-tech/scrooge-kit#plugins/grok` |
| **Gemini CLI** | `gemini extensions install https://github.com/sipki-tech/scrooge-kit` (pulls the release archive) |
| **Antigravity** | `git clone https://github.com/sipki-tech/scrooge-kit && agy plugin install ./scrooge-kit/plugins/antigravity` — never point `agy plugin install` at the repo URL: agy bulk-installs every directory under `plugins/` |
| **OpenCode** | `opencode plugin @sipki-tech/scrooge-kit-opencode` (or add `"plugin": ["@sipki-tech/scrooge-kit-opencode"]` to `opencode.json` yourself) |

Uninstall the same way: `/plugin uninstall`, `codex plugin remove scrooge-kit@scrooge-kit`, `grok plugin uninstall scrooge-kit`, `gemini extensions uninstall scrooge-kit`, `agy plugin uninstall scrooge-kit`, remove the config entry (OpenCode). Update: re-run the marketplace/extension update command of the agent (`agy` has no update — re-install).

## Why

| Pain | Scrooge Kit answer |
| --- | --- |
| Quota burns on `npm test` walls of text | PreToolUse hook: output enters the context compressed 60–90% |
| Each agent needs its own token setup | One repo, native plugin per agent, one shared policy |
| A 5 MB log pasted into the context | `scrooge-hygiene` skill + Headroom MCP: compress, retrieve originals on demand |
| Fear of tooling breaking sessions | Fail-open hooks (exit 0 always), no rewrite without the rtk binary, MCP shipped separately/disabled where a missing binary could fail |

## Guarantees

- **Fail-open**: every hook catches everything and exits 0 — a bug costs savings, never a session.
- **Never rewrites blind**: no rewrite when `rtk` is missing, the command is compound (`| ; && > $`), already prefixed, or bypassed.
- **Bypass**: `SCROOGE_RAW=1 <cmd>` for one raw command; `SCROOGE_RTK=off` for the session.
- **Native lifecycle**: install, update, and uninstall go through each agent's own plugin manager — Scrooge Kit never edits your configs.

## Repo layout

```
.claude-plugin/marketplace.json   # Claude Code marketplace: scrooge-kit + scrooge-headroom (Grok reads it too)
.agents/plugins/marketplace.json  # Codex-native marketplace (same two plugins, object sources)
plugins/
  claude-code/           # .claude-plugin + PreToolUse hook + skill
  claude-code-headroom/  # MCP-only plugin (install when headroom binary exists)
  claude-code-serena/    # MCP-only plugin: Serena LSP retrieval (install when serena binary exists)
  codex/                 # .codex-plugin + PreToolUse hook + skill
  gemini-cli/            # gemini-extension.json + BeforeTool hook + GEMINI.md (released as tar.gz)
  antigravity/           # plugin.json + hooks.json (deny-nudge) + mcp_config.json (disabled) + rules
  grok/                  # .claude-plugin manifest + hooks + skill (Claude-compatible layout)
  opencode/              # npm package: in-process rewrite + conditional headroom MCP
shared/                  # single source of truth: policy, rewriter, io, skill, rules
scripts/sync.mjs         # distributes shared/ into plugins (copies are committed; test enforces sync)
```

The rewrite policy (prefix list, bypasses) lives in exactly one file: `shared/scripts/lib/policy.mjs`.

## Measuring

[docs/benchmark.md](docs/benchmark.md) — acceptance protocol: ≥50% reduction in terminal-output tokens on a reference session, zero test failures missed due to compression. For spend visibility across agents use [ccusage](https://ccusage.com): `npx ccusage`.

## Development

```bash
npm test        # node --test, zero dependencies: policy, hook dialects, manifests, sync check
npm run sync    # re-distribute shared/ after editing it
npm run smoke   # sandboxed native install/uninstall against every agent CLI on this machine
```

## Acknowledgments

- [antigravity-kit](https://github.com/sipki-tech/antigravity-kit) — Scrooge Kit grew out of its Antigravity-only token stack; the two compose.
- [rtk](https://github.com/rtk-ai/rtk), [Headroom](https://github.com/headroomlabs-ai/headroom), [ccusage](https://ccusage.com) — the tools doing the actual saving.

## License

MIT
