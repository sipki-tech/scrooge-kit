# scrooge-kit: token hygiene

- Prefix dev terminal commands (git, tests, builds, package managers, linters, docker, kubectl) with `rtk`: `rtk git status`, `rtk npm test`. Skip the prefix only when the `rtk` binary is missing or exact raw output matters — then prefix with `SCROOGE_RAW=1` and say why.
- Read files selectively: locate the region first, read only that range; never re-read what you already saw. When Serena MCP tools are available, navigate by symbols (find symbol / references) instead of reading whole files.
- Never paste full build/test logs; extract failing lines plus minimal context. Route huge blobs through the `headroom_compress` MCP tool when available (`headroom_retrieve` recovers originals).
- Do not restate code you just wrote; reference the file and lines.
