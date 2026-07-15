# scrooge-kit: token hygiene

Route anything large away from the main context (these cut input noise, never your reasoning):
- **Repo code** → `codebase-memory` MCP: `index_repository` once, then `search_graph` / `trace_path` (inbound) / `get_code_snippet`. Don't read whole files.
- **Command output you read** (git, short test/build) → prefix `rtk`: `rtk git status`, `rtk npm test`.
- **Ballast output** (huge logs/dumps) → redirect to a scratch file, keep a preview + path; `grep`/range-read the detail later.
- **A blob you must carry** → `headroom_compress` → hash → `headroom_retrieve`.
- **A many-file question** → offload to a subagent (where available); it returns a summary, not the raw files.

They compose: `rtk npm test | tee "$LOG"` (compressed view + raw on disk). Bypass with `SCROOGE_RAW=1` (say why) when exact raw output matters; `SCROOGE_RTK=off` disables for a session. Don't re-read what you saw; don't restate code you wrote.
