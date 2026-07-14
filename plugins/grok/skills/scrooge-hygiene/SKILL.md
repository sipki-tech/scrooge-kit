---
name: scrooge-hygiene
description: Token hygiene rules for every session — rtk-prefixed terminal commands, selective file reading, no full logs in context. Use always; especially before running commands or reading large files.
---

# scrooge-hygiene — spend context on thinking, not on noise

## Goal

Keep the context window filled with signal. Terminal output, file contents, and logs enter the context only in compressed or selective form.

## Rules

1. **Terminal commands go through `rtk`.** Prefix dev commands (git, tests, builds, package managers, linters, docker, kubectl) with `rtk`: `rtk git status`, `rtk npm test`. If the `rtk` binary is missing, run the command as-is — never fail a task over the prefix. (When the scrooge-kit hook is installed it rewrites the command for you; the prefix habit is the fallback.)
2. **rtk bypass.** When exact, unfiltered output matters (parsing a specific error, user explicitly asks for raw output, a critical pipeline where lost detail is unacceptable), prefix with `SCROOGE_RAW=1` and say why. Compression is a default, not a law.
3. **Selective reading.** Do not read whole files when a range suffices. Locate the region first, then read only that region. When the `codebase-memory` MCP tools are available, index the repo once (`index_repository`), then navigate by graph queries — `search_graph` to locate a symbol, `trace_path` (direction inbound) for its callers/references, `get_code_snippet` for a body — instead of whole-file reads. It indexes polyglot/monorepos in one pass, no per-language setup. Re-reading a file you already saw is almost always waste.
4. **No full logs.** Never paste complete build/test logs into the context. Extract the failing lines plus a few lines of surrounding context. For huge blobs, use the headroom MCP tools (`headroom_compress`, originals recoverable via `headroom_retrieve`) when configured.
5. **No echo of code in prose.** After editing, do not restate the code you just wrote; reference the file and lines.

## Definition of Done for any task under this skill

- Every dev command in the session either went through `rtk` (prefix or hook rewrite) or has a stated `SCROOGE_RAW=1` bypass reason.
- No file was read in full when a targeted range would do.
- No raw log longer than ~20 lines entered the context uncompressed.
