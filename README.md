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
  <img alt="cross-agent" src="https://img.shields.io/badge/agents-8%20supported-5B8DEF?style=for-the-badge&labelColor=111827" />
  <img alt="token savings" src="https://img.shields.io/badge/terminal%20tokens-−60–90%25-F59E0B?style=for-the-badge&labelColor=111827" />
  <img alt="zero deps" src="https://img.shields.io/badge/dependencies-0-22C55E?style=for-the-badge&labelColor=111827" />
  <img alt="MIT license" src="https://img.shields.io/badge/license-MIT-64748B?style=for-the-badge&labelColor=111827" />
</p>

<p align="center">
  English | <a href="README.ru.md">Русский</a>
  &nbsp;·&nbsp; <a href="docs/GUIDE.md">📖 User Guide</a>
</p>

> Scrooge McDuck diving into a money bin of saved tokens.

**Scrooge Kit** is a cross-agent token-saving kit. One install wires proven token-economy tools into every coding agent on your machine — the same discipline, the same bypasses, the same policy everywhere:

```
terminal command output ──► [rtk: rewrite hook]        ──► agent context   (−60–90% tokens)
big blobs / logs / files ──► [Headroom: MCP compress]  ──► LLM API         (−60–95% tokens)
all agents' local logs   ──► [ccusage: spend reports]  ──► `scrooge-kit status`
```

- **[rtk](https://github.com/rtk-ai/rtk)** — compresses terminal command output before it reaches the context. Scrooge Kit installs a PreToolUse hook that transparently rewrites `git status` → `rtk git status`; the agent never has to remember a prefix.
- **[Headroom](https://github.com/headroomlabs-ai/headroom)** — reversible compression of big blobs via MCP tools (`headroom_compress` / `headroom_retrieve` / `headroom_stats`).
- **[ccusage](https://ccusage.com)** — token-spend reporting across agents.

## Why

| Pain | Scrooge Kit answer |
| --- | --- |
| Quota burns on `npm test` walls of text | rtk rewrite hook: output enters the context compressed 60–90% |
| Each agent needs its own token setup | One policy, 8 adapters: install once, every agent gets it |
| A 5 MB log pasted into the context | `scrooge-hygiene` skill + Headroom MCP: compress, retrieve originals on demand |
| No idea where the tokens went | `scrooge-kit status` — spend per agent via ccusage |
| Fear of tooling breaking sessions | Fail-open hooks, non-destructive config merges, full `--dry-run` |

## Supported agents

| Agent | Mechanism | Command rewrite |
|---|---|---|
| Claude Code | PreToolUse hook + skill + MCP + optional statusline | ✅ transparent |
| Gemini CLI | extension (hooks + GEMINI.md + MCP) | ✅ transparent |
| Antigravity | plugin (hooks + skill + rules + MCP) | ⚠️ deny-nudge |
| Codex CLI | config.toml marker block + AGENTS.md + skill | ✅ transparent |
| OpenCode | JS plugin (`tool.execute.before`) + MCP | ✅ in-process |
| Grok CLI | settings.json hooks + MCP | ✅ best-effort |
| Cursor | beforeShellExecution nudge + MCP + User Rule | ⚠️ nudge only |
| Windsurf | global rules + MCP | ⚠️ rules only |

Per-agent details and caveats: [docs/agents.md](docs/agents.md).

## Install

Local for now (not yet published):

```bash
git clone https://github.com/sipki-tech/scrooge-kit && cd scrooge-kit

node bin/cli.mjs install                     # all detected agents
node bin/cli.mjs install --dry-run           # preview every action first
node bin/cli.mjs install --agent claude-code,codex
node bin/cli.mjs install --with-rtk --with-headroom   # also install the binaries
node bin/cli.mjs install --statusline        # (claude-code) ccusage statusline if none set

node bin/cli.mjs verify                      # health checks per agent
node bin/cli.mjs status                      # detected agents + spend via ccusage
node bin/cli.mjs uninstall                   # removes exactly what we added
```

Requires Node 18+. Restart your agents after install — hooks load at session start.

## Guarantees

- **Fail-open**: a broken hook returns a no-op and exit 0 — never breaks a session.
- **Never rewrites blind**: no rewrite when `rtk` is missing, the command is compound (`| ; && > $`), already prefixed, or bypassed.
- **Bypass**: prefix any command with `SCROOGE_RAW=1` for raw output; `SCROOGE_RTK=off` disables rewriting session-wide.
- **Non-destructive**: configs are merged, never overwritten; uninstall removes only entries identical to what we installed. Appends to files we don't own (config.toml, AGENTS.md, global_rules.md) live between `# >>> scrooge-kit >>>` markers.
- **Dry-run everything**: every mutation goes through a journal; `--dry-run` prints the exact plan.

## Measuring

[docs/benchmark.md](docs/benchmark.md) — acceptance protocol: ≥50% reduction in terminal-output tokens on a reference session, zero test failures missed due to compression.

## Development

```bash
npm test    # node --test, zero dependencies
```

Layout: `core/` — installer machinery (journal/dry-run, detection, MCP merge, policy); `adapters/` — one thin module per agent; `payload/` — what lands in `~/.scrooge-kit` (hook scripts, skill, rules); `docs/` — agent matrix, Headroom notes, benchmark protocol.

## Acknowledgments

- [antigravity-kit](https://github.com/sipki-tech/antigravity-kit) — Scrooge Kit grew out of its Antigravity-only token stack; the two kits compose.
- [rtk](https://github.com/rtk-ai/rtk), [Headroom](https://github.com/headroomlabs-ai/headroom), [ccusage](https://ccusage.com) — the tools doing the actual saving.

## License

MIT
