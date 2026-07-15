---
name: scrooge-hygiene
description: Token hygiene for every session — route each large context input through its cheapest channel (rtk, scratch files, codebase-memory, Headroom, subagents). Use always; especially before running commands, reading files, or exploring the repo.
---

# scrooge-hygiene — spend context on thinking, not on noise

## Goal
Keep the context window full of signal. Anything large — command output, files, logs, blobs — enters the
context only compressed, selectively, or not at all. Every lever here cuts **input noise**, never your
reasoning: think as much as the task needs (constraining reasoning to save tokens degrades quality — that is
explicitly not what this skill does).

## The one question — something large is about to enter my context: what is it?

| Input | Route it through | Result |
|---|---|---|
| **Repo code** — symbols, references, function bodies | `codebase-memory` MCP: `index_repository` once, then `search_graph` / `trace_path` (direction inbound, for callers) / `get_code_snippet` | navigate the graph; never read whole files |
| **Command output you want to read** — git, a short test/build | `rtk <cmd>` (`rtk git status`, `rtk npm test`) | you see it, compressed 60–90% |
| **Command output that's mostly ballast** — a 2000-line log/dump | redirect to a scratch file (`cmd > "$(mktemp)"`), keep only a preview + the path; `grep`/range-read the detail later | not loaded into context; retrieved once, only if needed |
| **A blob you must carry through context / between tools** | `headroom_compress` → hash → `headroom_retrieve` | reversibly compressed |
| **A task that needs reading many files to answer one question** | offload to a subagent (where the host supports one) — it applies the rows above internally and returns a compact summary | raw files never touch the main context |

## They compose — layers, not rivals
- The subagent is the outer envelope; the other four are the tactics it (or you) use inside.
- rtk and scratch combine on one command:
  `rtk npm test | tee "$LOG"` → compressed view now, raw on disk for a targeted `grep -A5 FAIL "$LOG"` later.
- Routing by input type keeps them from overlapping: code → codebase-memory, output-you-read → rtk,
  output-ballast → scratch, carried-blob → Headroom, many-files → subagent.

## Always
- **Bypass:** when exact raw output matters (parsing a specific error, the user asks for raw output, a
  pipeline where lost detail is unacceptable), prefix `SCROOGE_RAW=1` and say why. Compression is a default,
  not a law. Turn rtk off for a session with `SCROOGE_RTK=off`. (Where the scrooge-kit hook is installed it
  applies the `rtk` prefix for you; the habit is the fallback.)
- **No re-reads:** re-reading a file or output you already saw is almost always waste.
- **No echo of code:** after editing, don't restate the code you wrote — reference the file and lines.

## Definition of done for any task under this skill
- Every dev command went through `rtk` (prefix or hook rewrite) or has a stated `SCROOGE_RAW=1` reason.
- No whole-file read where a range or a `codebase-memory` graph query would do.
- No raw log longer than ~20 lines entered the context uncompressed (rtk, scratch, or Headroom instead).
- Multi-file exploration was offloaded to a subagent, or there's a reason it wasn't.
