# Scrooge Kit — User Guide

English | [Русский](GUIDE.ru.md)

How the plugins work, how to install them natively per agent, how to bypass the rewrite when you need raw output, and how to measure the savings.

---

## 1. The idea in 60 seconds

Coding agents burn most of their context on terminal output and big blobs. Scrooge Kit ships a **native plugin for each agent** that attacks both:

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

Three layers:

1. **rtk** (terminal) — the hook above; transparent where the host supports input rewriting, advisory elsewhere.
2. **Headroom** (blobs) — MCP tools `headroom_compress` / `headroom_retrieve` / `headroom_stats`; the `scrooge-hygiene` skill teaches the agent to use them. Reversible — originals are cached.
3. **Skill + rules** — selective reads, no raw logs, bypass etiquette.

Every layer degrades gracefully: no rtk binary → hooks are silent no-ops; no headroom binary → its MCP plugin simply isn't installed (or ships disabled).

## 2. Prerequisites

```bash
brew install rtk                     # or: curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh
pip install "headroom-ai[all]"       # optional, Python 3.10+; or uv tool install / pipx install
```

## 3. Install per agent

Every command below is exercised live against the real CLI (see the verification matrix in [agents.md](agents.md)); re-check on your machine anytime with `npm run smoke`.

### Claude Code
```
/plugin marketplace add sipki-tech/scrooge-kit
/plugin install scrooge-kit@scrooge-kit
/plugin install scrooge-headroom@scrooge-kit    # only if `headroom` is on PATH
```
Non-interactive: `claude plugin install scrooge-kit@scrooge-kit --scope user`. The headroom MCP is a **separate plugin** because Claude Code plugins can't ship MCP servers disabled — installing it without the binary would show connection errors.

### Codex CLI (≥0.144)
```bash
codex plugin marketplace add sipki-tech/scrooge-kit
codex plugin add scrooge-kit@scrooge-kit
codex plugin add scrooge-headroom@scrooge-kit   # only if `headroom` is on PATH
```
Codex resolves the repo's native `.agents/plugins/marketplace.json` (dedicated `plugins/codex/` with `.codex-plugin` manifest); older snapshots fall back to the legacy `.claude-plugin/marketplace.json`. Uninstall: `codex plugin remove scrooge-kit@scrooge-kit`.

### Grok Build
```bash
grok plugin install sipki-tech/scrooge-kit#plugins/grok
```
Installs the dedicated Grok plugin straight from the repo subdirectory. `grok plugin marketplace add sipki-tech/scrooge-kit` also works (Grok reads the Claude marketplace) but resolves the Claude Code build of the plugin — prefer the subdir install. Uninstall: `grok plugin uninstall scrooge-kit`.

### Gemini CLI
```bash
gemini extensions install https://github.com/sipki-tech/scrooge-kit
```
Pulls the `scrooge-kit.gemini-extension.tar.gz` asset from the latest GitHub Release. Dev/local: `gemini extensions link ./plugins/gemini-cli`. The hook uses Gemini's `BeforeTool` event; hook-bearing extensions ask for consent at install.

### Antigravity (agy)
```bash
git clone https://github.com/sipki-tech/scrooge-kit
agy plugin install ./scrooge-kit/plugins/antigravity
```
**Never** run `agy plugin install https://github.com/sipki-tech/scrooge-kit` — agy bulk-installs every directory under a repo's `plugins/`, i.e. all six agent payloads. There is no `agy plugin update`; to update, pull and re-install. The hook runs in **deny-nudge** mode (Antigravity hooks can't mutate args): the deny reason contains the exact `rtk …` command, and the agent immediately retries with it. Headroom is pre-registered in `mcp_config.json` with `"disabled": true` — remove that key once the binary is installed.

### OpenCode
```bash
opencode plugin @sipki-tech/scrooge-kit-opencode      # or -g for the global config
```
OpenCode's own plugin command adds the entry to `opencode.json` for you; adding `{ "plugin": ["@sipki-tech/scrooge-kit-opencode"] }` by hand works too. Auto-installed from npm at startup. The plugin rewrites in-process (`tool.execute.before`) and registers the Headroom MCP **only when the binary is present** (checked at startup via the `config` hook).

## 4. Day-to-day: the rewrite and its bypasses

Commands like `git status`, `npm test`, `cargo build`, `docker ps` silently become `rtk …`. The prefix list lives in one file: `shared/scripts/lib/policy.mjs` (installed inside each plugin as `scripts/lib/policy.mjs`).

The hook **refuses to rewrite** when rewriting could hurt:

- `rtk` is not on PATH (a rewrite would fail the command)
- the command is compound or redirected: `| ; & > < $ \`` or multi-line
- the command already starts with `rtk`
- a bypass is active

**Bypasses** (also honored by the `scrooge-hygiene` skill):

```bash
SCROOGE_RAW=1 npm test     # one command, raw output (KIT_RAW=1 works too)
SCROOGE_RTK=off            # env var: disable rewriting for the session
```

## 5. Headroom

When the agent needs a huge log or file, the skill tells it to call `headroom_compress` instead of pasting the blob, and `headroom_retrieve` to recover the original. Note: the server command is `headroom mcp serve` — in Headroom ≥0.28 bare `headroom mcp` is a command group, not a server.

## 6. Monitoring & measuring

- Spend per agent: `npx ccusage` (reads local logs of Claude Code, Codex, Gemini CLI, OpenCode and more). Claude Code statusline: `npx ccusage statusline` in your `settings.json` `statusLine` if you want an always-visible number.
- Savings protocol: [benchmark.md](benchmark.md) — same three tasks with `SCROOGE_RTK=off` vs on; accept at ≥50% fewer terminal-output tokens and **zero** missed test failures. `rtk gain` / `headroom_stats` give per-tool numbers.

## 7. Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Commands aren't rewritten | rtk not installed (`which rtk`), or the session started before the plugin — restart the agent. |
| headroom MCP "Failed to connect" | Binary missing (uninstall `scrooge-headroom` until it's installed) or the entry isn't `headroom mcp serve`. |
| Need raw output once | `SCROOGE_RAW=1 <cmd>`. Session-wide: `SCROOGE_RTK=off`. |
| Suspect the hook | It's fail-open (exit 0 always); `SCROOGE_RTK=off` neutralizes it without uninstalling. |
| Remove everything | Uninstall via each agent's plugin manager (see §3) — nothing else was touched. |

## 8. Safety model

- **Fail-open law**: every hook wraps in a catch-all and exits 0.
- **No blind rewrites**: the four refuse-conditions in §4 run on every call.
- **Native lifecycle**: plugins never edit user configs; install/update/uninstall is the host's plugin manager.
- **One source of truth**: `shared/` is distributed into plugins by `scripts/sync.mjs`; a test fails if any copy drifts.
