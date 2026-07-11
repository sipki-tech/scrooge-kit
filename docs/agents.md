# Per-agent integration notes

Verification status as of 2026-07: **[verified]** — wire format documented by the host and exercised; **[best-effort]** — mirrors a documented pattern, fail-open if the host ignores it.

## claude-code [verified]
- Hook: `~/.claude/settings.json` → `hooks.PreToolUse` matcher `Bash`, rewrites via `hookSpecificOutput.updatedInput`.
- Skill: `~/.claude/skills/scrooge-hygiene/`.
- MCP: registered through `claude mcp add --scope user headroom -- headroom mcp serve` (only when the headroom binary exists; editing `~/.claude.json` directly is avoided on purpose — it holds live session state).
- Statusline: `--statusline` sets a ccusage statusline **only if none is configured**; uninstall removes it only if it is exactly ours.

## gemini-cli [best-effort]
- Everything ships as one extension: `~/.gemini/extensions/scrooge-kit/` (manifest + `GEMINI.md` rules + `hooks/hooks.json` + skill copy).
- Hook wire format mirrors Claude's `hookSpecificOutput`; Gemini docs describe parameter rewriting for `run_shell_command` — if a build ignores it, the original command just runs.

## antigravity [verified via antigravity-kit traps]
- Plugin at `~/.gemini/config/plugins/scrooge-kit/` (+ mirror in `~/.gemini/antigravity-cli/plugins/` when present).
- Carries the loader traps: `installed_version.json`, object `author`, `hooks.json` at plugin root with the named top-level key.
- Rewriter runs in **deny-nudge** dialect (arg mutation unverified on this host): the deny reason contains the exact `rtk`-prefixed command to run instead.
- MCP: headroom merged into `~/.gemini/config/mcp_config.json` (disabled unless the binary exists).

## codex [best-effort]
- `~/.codex/config.toml`: appended marker block with `[[hooks.PreToolUse]]` (+ `[mcp_servers.headroom]` when the binary exists). We never parse user TOML — only append/remove our `# >>> scrooge-kit >>>` block.
- Rules appended to `~/.codex/AGENTS.md` in the same marker style; skill copied to `~/.codex/skills/`.
- Hooks are stable since Codex v0.124; not available on Windows.

## opencode [verified pattern]
- Generated JS plugin at `~/.config/opencode/plugin/scrooge-kit.js` using `tool.execute.before` — mutates the bash args in-process, no wire-format guessing. Imports the shared policy from `~/.scrooge-kit`.
- MCP: `headroom` entry in `~/.config/opencode/opencode.json` (only when the binary exists — opencode has no disabled flag in the shape we write).

## grok [best-effort]
- `~/.grok/settings.json`: Claude-style `hooks.PreToolUse` + `mcpServers.headroom`. A build that ignores `hookSpecificOutput` runs the original command.

## cursor [nudge only]
- Hooks can gate/annotate but not rewrite: `~/.cursor/hooks.json` `beforeShellExecution` returns `permission: allow` with an `agent_message` suggesting the `rtk`-prefixed command.
- MCP: `~/.cursor/mcp.json`. Rules are project-scoped in Cursor — install prints the User Rule one-liner to add manually.

## windsurf [rules only]
- Cascade hooks only gate (exit code), so no hook is installed: rules appended to `~/.codeium/windsurf/memories/global_rules.md` (marker block) + MCP in `~/.codeium/windsurf/mcp_config.json`.

## Shared payload

All hooks reference `~/.scrooge-kit/` (single copy of scripts/skills/rules). `scrooge-kit uninstall` removes it last. The rewrite policy (`prefix list, bypasses`) lives in one file: `~/.scrooge-kit/scripts/lib/policy.mjs`.
