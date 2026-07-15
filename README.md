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
  <img alt="native plugins" src="https://img.shields.io/badge/native%20plugins-5%20agents-5B8DEF?style=for-the-badge&labelColor=111827" />
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

- **[rtk](https://github.com/rtk-ai/rtk)** — routes `git status` → `rtk git status` so output enters the context compressed, failures intact. Only commands rtk actually compresses are routed — `git status/diff/log/show/add/commit/push/pull/…`, `npm`, `cargo`, `pytest`, `docker`, `kubectl`, … — while anything it doesn't handle (`git clone`, `checkout`, plain `ls`/`grep`) passes through untouched. On hosts whose hooks can mutate a command (Claude Code, Codex, OpenCode) the rewrite is silent; on hosts that can only allow/deny (Antigravity, Grok) the hook denies the raw command and nudges the agent to re-run it through rtk. **Known limitation:** Grok does not currently execute plugin `PreToolUse` hooks (verified upstream behaviour, not a kit defect), so rtk enforcement is inert there — fail-open, and Grok's skill + MCP still work. rtk is verified live on Antigravity and Claude Code.
- **[Headroom](https://github.com/headroomlabs-ai/headroom)** — reversible blob compression via MCP tools (`headroom_compress` / `headroom_retrieve` / `headroom_stats`).
- **[codebase-memory](https://github.com/DeusData/codebase-memory-mcp)** — code-graph retrieval over MCP: it indexes the repo (158 languages via tree-sitter + hybrid LSP for 12), so the agent queries symbols, references and call-paths instead of reading whole files. Zero per-language setup; polyglot monorepos in a single index.
- **scrooge-hygiene skill + rules** — selective reads, no raw logs, bypass etiquette.

Prerequisite for the savings: `brew install rtk` (hooks are silent no-ops without it); optionally `pip install "headroom-ai[all]"` and `npm install -g codebase-memory-mcp`.

## Install (native, per agent)

Every command below is exercised against the real CLI — see [docs/agents.md](docs/agents.md) for the verification matrix and `npm run smoke` for the sandboxed re-check.

Every plugin bundles the Headroom + codebase-memory MCP servers — they come **enabled**. If the `headroom` / `codebase-memory-mcp` binary isn't on PATH the host shows a one-line MCP connection error and everything else keeps working; install the binaries (below) to clear it.

| Agent | Install |
|---|---|
| **Claude Code** | `/plugin marketplace add sipki-tech/scrooge-kit` → `/plugin install scrooge-kit@scrooge-kit` |
| **Codex CLI** | `codex plugin marketplace add sipki-tech/scrooge-kit` → `codex plugin add scrooge-kit@scrooge-kit` |
| **Grok Build** | `grok plugin install sipki-tech/scrooge-kit#plugins/grok` |
| **Antigravity** | `agy plugin install https://github.com/sipki-tech/scrooge-kit/plugins/antigravity` — the `/plugins/antigravity` subdir path is required; a bare repo URL bulk-installs every `plugins/` dir |
| **OpenCode** | `opencode plugin @sipki-tech/scrooge-kit-opencode` (or add `"plugin": ["@sipki-tech/scrooge-kit-opencode"]` to `opencode.json` yourself) |

Uninstall the same way: `/plugin uninstall`, `codex plugin remove scrooge-kit@scrooge-kit`, `grok plugin uninstall scrooge-kit`, `agy plugin uninstall scrooge-kit`, remove the config entry (OpenCode). Update: re-run the marketplace/extension update command of the agent (`agy` has no update — re-install).

## Why

| Pain | Scrooge Kit answer |
| --- | --- |
| Quota burns on `npm test` walls of text | PreToolUse hook: output enters the context compressed 60–90% |
| Each agent needs its own token setup | One repo, native plugin per agent, one shared policy |
| A 5 MB log pasted into the context | `scrooge-hygiene` skill + Headroom MCP: compress, retrieve originals on demand |
| Fear of tooling breaking sessions | Fail-open hooks (exit 0 always), no rewrite without the rtk binary; MCP ships enabled — a missing binary is a visible connection error, never a broken session |

## Guarantees

- **Fail-open**: every hook catches everything and exits 0 — a bug costs savings, never a session.
- **Never rewrites blind**: no rewrite when `rtk` is missing, the command is compound (`| ; && > $`), already prefixed, or bypassed.
- **Bypass**: `SCROOGE_RAW=1 <cmd>` for one raw command; `SCROOGE_RTK=off` for the session.
- **Native lifecycle**: install, update, and uninstall go through each agent's own plugin manager — Scrooge Kit never edits your configs.

## Repo layout

```
.claude-plugin/marketplace.json   # Claude Code marketplace: scrooge-kit (Grok reads it too)
.agents/plugins/marketplace.json  # Codex-native marketplace (same plugin, object source)
plugins/
  claude-code/           # .claude-plugin + PreToolUse hook + skill + .mcp.json (Headroom + codebase-memory)
  codex/                 # .codex-plugin + PreToolUse hook + skill
  antigravity/           # plugin.json + hooks.json (deny-nudge) + mcp_config.json (Headroom + codebase-memory) + rules
  grok/                  # .claude-plugin manifest + hooks (deny-nudge) + skill + .mcp.json (Headroom + codebase-memory)
  opencode/              # npm package: in-process rewrite + conditional Headroom/codebase-memory MCP
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
