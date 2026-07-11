# Scrooge Kit — User Guide

English | [Русский](GUIDE.ru.md)

Everything you need to run Scrooge Kit day to day: what it actually does to your agents, how to install and verify it, how to bypass it when you need raw output, and how to measure what it saves.

---

## 1. The idea in 60 seconds

Coding agents burn most of their context on three things: terminal output, big files/logs, and re-reading what they already saw. Scrooge Kit attacks the first two with existing, battle-tested tools and gives you visibility into the third:

```
you: "run the tests"
agent calls Bash("npm test")
        │
        ▼
[scrooge-kit PreToolUse hook]  ── rewrites ──►  Bash("rtk npm test")
        │
        ▼
rtk runs the real command, strips the noise
        │
        ▼
agent context receives ~10–40% of the original output — failures intact
```

Three layers, three tools:

1. **rtk** (terminal) — the hook above. Transparent: the agent never types the prefix itself.
2. **Headroom** (blobs) — an MCP server with `headroom_compress` / `headroom_retrieve` / `headroom_stats`. The `scrooge-hygiene` skill teaches the agent to route oversized logs through it. Compression is reversible — originals are cached and retrievable.
3. **ccusage** (visibility) — `scrooge-kit status` shows token spend per agent from their local logs.

The layers are independent; each degrades gracefully if its binary is missing.

## 2. Install in one minute

Distributed from GitHub (not npm). npx caches GitHub installs — add `#main` to force the latest commit:

```bash
# see the exact plan first — nothing is written
npx github:sipki-tech/scrooge-kit install --dry-run

# install for every agent detected on this machine
npx github:sipki-tech/scrooge-kit install

# or pick agents explicitly (comma-separated)
npx github:sipki-tech/scrooge-kit install --agent claude-code,codex

# also install the binaries if you don't have them
npx github:sipki-tech/scrooge-kit install --with-rtk --with-headroom
```

From a clone the same commands run as `node bin/cli.mjs <command>`.

Flags:

| Flag | Effect |
| --- | --- |
| `--agent <name>\|all` | Target agents. Known: claude-code, codex, gemini-cli, antigravity, opencode, grok, cursor, windsurf |
| `--dry-run` | Print the journal of actions without touching anything |
| `--with-rtk` | Install the rtk binary (brew or official script) |
| `--with-headroom` | Install the Headroom CLI (uv/pipx/pip3) |
| `--statusline` | (claude-code) set a ccusage statusline — only if none is configured |

Then **restart your agents** — hooks load at session start.

Check the install any time:

```bash
npx github:sipki-tech/scrooge-kit verify   # per-agent health checks, exit 1 on failure
npx github:sipki-tech/scrooge-kit status   # detected agents, tool availability, spend report
```

## 3. What lands where

One shared payload plus a thin per-agent touch:

| Target | What is written |
| --- | --- |
| `~/.scrooge-kit/` | Shared payload: hook scripts, rewrite policy, skill, rules. Every agent's hooks reference this single copy. |
| `~/.claude/settings.json` | PreToolUse hook (matcher `Bash`); skill copied to `~/.claude/skills/scrooge-hygiene/`; headroom via `claude mcp add` |
| `~/.gemini/extensions/scrooge-kit/` | Gemini CLI extension: manifest + GEMINI.md rules + hooks + skill |
| `~/.gemini/config/plugins/scrooge-kit/` | Antigravity plugin (mirrored to `antigravity-cli/plugins` when present); headroom merged into `mcp_config.json` |
| `~/.codex/config.toml`, `~/.codex/AGENTS.md` | Marker-delimited blocks (`# >>> scrooge-kit >>>`); skill to `~/.codex/skills/` |
| `~/.config/opencode/plugin/scrooge-kit.js` | Generated plugin mutating bash args in-process; headroom in `opencode.json` |
| `~/.grok/settings.json` | Claude-style hooks + `mcpServers.headroom` |
| `~/.cursor/hooks.json`, `~/.cursor/mcp.json` | Nudge hook + MCP (Cursor can't rewrite — see §6) |
| `~/.codeium/windsurf/` | Rules appended to `memories/global_rules.md` + MCP entry |

Everything is merged non-destructively: your existing hooks, servers, and settings are never touched, and `uninstall` removes only entries identical to what the kit wrote.

## 4. Day-to-day: the rewrite and its bypasses

You mostly notice nothing — that's the point. Commands like `git status`, `npm test`, `cargo build`, `docker ps`, `kubectl get pods` silently become `rtk git status`, `rtk npm test`, … The full prefix list lives in one file: `~/.scrooge-kit/scripts/lib/policy.mjs`.

The hook **refuses to rewrite** when rewriting could hurt:

- `rtk` binary is not on PATH (a rewrite would fail the command)
- the command is compound or redirected: `| ; & > < $ \`` or multi-line
- the command already starts with `rtk`
- a bypass is active

**Bypasses** (also honored by the `scrooge-hygiene` skill):

```bash
SCROOGE_RAW=1 npm test     # one command, raw output (KIT_RAW=1 works too)
SCROOGE_RTK=off            # env var: disable rewriting for the session
```

Use a bypass when exact output matters: parsing a specific error, a flaky failure you're bisecting, a report the user asked to see verbatim.

## 5. Headroom: compressing what isn't terminal output

When the agent needs a huge log or file, the `scrooge-hygiene` skill tells it to call `headroom_compress` instead of pasting the blob, and `headroom_retrieve` to get the original back if details are needed. `headroom_stats` shows what compression is doing.

Wiring notes:

- The MCP server command is `headroom mcp serve` (in Headroom ≥0.28 `headroom mcp` alone is a command group, not a server).
- Where a host supports it, the entry ships `"disabled": true` unless the binary is present — a missing binary can never break sessions. Re-run `npx github:sipki-tech/scrooge-kit install` after installing Headroom to flip entries on.
- Headroom also has an HTTP proxy mode (`headroom proxy`) that compresses all traffic via `ANTHROPIC_BASE_URL`/`OPENAI_BASE_URL`. The kit doesn't wire it — spike manually if you want it (see [headroom.md](headroom.md)).

## 6. Per-agent notes you'll actually hit

- **Claude Code** — the reference integration: transparent rewrite via `hookSpecificOutput.updatedInput`. `--statusline` adds a ccusage statusline only if you have none; uninstall removes it only if it's exactly ours.
- **Antigravity** — hooks can deny but not (verifiably) mutate args, so instead of rewriting the hook denies with the exact command to run: the agent immediately retries with `rtk …`. One extra round-trip, same savings.
- **Cursor** — hooks only gate/annotate. The kit installs an advisory nudge plus MCP, and prints a one-line User Rule to add manually — do it, it's what makes the agent prefix commands itself.
- **Windsurf** — no command hooks at all: rules + MCP only.
- **Gemini CLI / Codex / Grok** — the rewrite mirrors Claude's wire format; where a build ignores it, the original command simply runs (fail-open). Status per agent: [agents.md](agents.md).

## 7. Monitoring

```bash
npx github:sipki-tech/scrooge-kit status
```

Prints detected agents, rtk/headroom availability, then a ccusage spend report (Claude Code, Codex, Gemini CLI, OpenCode and more read from local logs). For an always-visible daily number in Claude Code, install with `--statusline`.

## 8. Measuring the savings

Follow [benchmark.md](benchmark.md): the same three tasks (feature / debug / refactor) run twice — optimization off (`SCROOGE_RTK=off`, headroom disabled) vs on. Acceptance: ≥50% fewer tokens on terminal output, **zero** failing tests missed due to compression. `rtk gain` and `headroom_stats` supply the per-tool numbers.

## 9. Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Commands aren't being rewritten | Agent session started before install — restart the agent. Then check `npx github:sipki-tech/scrooge-kit verify`. |
| `rtk: command not found` after rewrite | Shouldn't happen (the hook probes PATH first); if the agent's PATH differs from your shell's, install rtk somewhere the agent sees, or `SCROOGE_RTK=off`. |
| headroom MCP "Failed to connect" | The entry must be `headroom mcp serve`, not `headroom mcp`. Re-run install — old entries are pruned and re-added correctly. |
| A hook seems to break a session | It can't (fail-open, exit 0 always) — but if you suspect it, `SCROOGE_RTK=off` neutralizes the rewriter without uninstalling. |
| Want everything gone | `npx github:sipki-tech/scrooge-kit uninstall` — removes hooks, skills, MCP entries and `~/.scrooge-kit`; anything you edited survives. |

## 10. Safety model

- **Fail-open law**: every hook wraps in a catch-all and exits 0. A bug in the kit costs you savings, never a session.
- **No blind rewrites**: the four refuse-conditions in §4 are checked on every call.
- **Non-destructive installs**: JSON merges keyed on `scrooge-kit` in commands; marker blocks in files the kit doesn't own; MCP prune removes only exact matches of what was installed.
- **Journal everything**: `--dry-run` shows the same journal a real run executes — what you preview is what happens.
