# headless-project fixture

Throwaway **polyglot** project (Go + JS in one dir) for `scripts/headless-check.mjs`.
codebase-memory-mcp indexes both languages in a single pass — no per-language setup — so one fixture
covers both. Known symbol → call-site pairs (asserted so a tool can't false-green on empty references):

| Language | Symbol | Known call site |
|---|---|---|
| Go | `Greet` in `greet/greet.go` | `main.go` (func `main`) |
| JavaScript | `greet` in `lib/greet.mjs` | `index.mjs` |

Nothing here is meant to run for real; the harness copies it to a temp dir and queries it.
