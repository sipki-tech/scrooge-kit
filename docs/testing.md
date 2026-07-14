# Testing

Scrooge Kit is tested in two layers. The first is deterministic and free; the second drives real
coding-agent CLIs and spends tokens.

| Command | Layer | Needs | Cost |
|---|---|---|---|
| `npm test` | Contract (unit) | node only | free |
| `npm run smoke` | Native install/uninstall | each agent CLI on PATH | free |
| `npm run check:headless` | Integration (end-to-end) | agy / grok CLIs + binaries | Layer A free · Layer B spends tokens |

## Layer 1 — deterministic contract (`npm test`)

`test/rewriter.test.mjs` pipes synthetic host events through `shared/scripts/rtk-rewriter.mjs` and asserts
the exact wire response per dialect:

- **mutating hosts** (`claude-code`, `codex`) → silent `hookSpecificOutput.updatedInput` rewrite; bare `{}` no-op.
- **decision hosts** (`antigravity`, `grok`) → deny-nudge on a dev command; explicit `{decision:"allow"}` on
  every no-op (a bare `{}` reads as *deny* on Antigravity — this is the fix that stops empty denials).

`test/plugins.test.mjs` checks plugin manifests, hook matchers/dialects, marketplace sources, and that the
bundled Headroom + codebase-memory MCP servers ship **enabled** (no `disabled` flag). It also runs `sync --check`.

## Layer 2 — headless integration (`npm run check:headless`)

`scripts/headless-check.mjs` proves the whole chain works, not just that the script emits the right JSON.

**A — harness-verified (deterministic, hard PASS/FAIL, no tokens).** Re-pipes the hook per dialect, confirms
the MCP configs bundle Headroom + codebase-memory **enabled**, reports whether the `rtk` / `headroom` /
`codebase-memory-mcp` binaries are on PATH, and — the key new check — drives **codebase-memory's own `cli`**
against the polyglot fixture: it `index_repository`s the throwaway `test/fixtures/headless-project` (Go + JS in
one dir) and runs `trace_path --direction inbound` for a known symbol→caller pair, asserting the reference
resolves. Because codebase-memory indexes polyglot repos in a single pass with no per-language setup, one
fixture covers both `Greet`→`main.go` (Go) and `greet`→`index.mjs` (JS). Empty callers = FAIL (the reference
provably exists). Run just this layer with `--no-agents`.

**B — agent-driven (best-effort, spends tokens).** For each of `agy` / `grok` found on PATH, it stages the
fixture into a temp git repo and runs the corrected self-check (`test/prompts/self-check.md`) headless:

- `agy -p "<prompt>" --add-dir <fixture> --dangerously-skip-permissions --print-timeout 4m`
- `grok -p "<prompt>" --always-approve`

It greps the transcript for end-to-end markers and prints a transcript tail:

- **rtk** — the agent ran a *bare* `git status` and the hook denied+nudged it to `rtk git status`; a bare
  `ls` was not blocked (exercises the deny-nudge and the empty-deny fix — which the agent, if left to its
  own devices, skips by self-prefixing `rtk`).
- **Headroom** — a `compress → stats → retrieve` roundtrip.
- **codebase-memory** — for the known symbols the references include `main.go` (Go) and `index.mjs` (JS).
  A reported empty/failed reference is a FAIL, not a pass (the prompt forbids rationalizing it away).

### Why the fixture

The earlier manual self-check hardcoded Scrooge Kit's own symbols (`rewriteCommand`, `PREFIXES`), so running
it inside any other project made the agent leave that project and inspect the installed plugin's source —
retrieval was demonstrated on the plugin, not on real code. The fixture makes the check project-agnostic and
gives a **known-answer** target. It is a single polyglot dir (Go + JS): codebase-memory indexes both languages
at once, so no per-language configuration is needed — a deliberate contrast to per-language-LSP tools that
would only see one language in a mixed dir.

### Reading the results

Layer A is a hard gate (exit 1 on failure) and now includes real code-navigation, so it catches a broken
retrieval engine without spending a token. Layer B is **advisory** — agent behaviour is non-deterministic and
the exact `agy -p` / `grok -p` transcript format varies, so its markers are `WARN`, not `FAIL`, and the
transcript tail is printed for eyeballing. Calibrate the marker regexes in `markers()` against real output the
first time you run it on a new CLI version.
