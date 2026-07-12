# Headroom integration

Headroom compresses everything the agent reads (tool outputs, logs, files, RAG chunks) before it reaches the LLM: 60–95% fewer tokens, reversible (originals cached for retrieval). Repo: https://github.com/headroomlabs-ai/headroom

It complements rtk — they work on different token streams and the savings multiply:

```
terminal command output --> [rtk: output compression]    --> agent context
agent context / files   --> [Headroom: blob compression] --> LLM API
```

## Supported mode: MCP server

How each plugin ships it (a missing binary must never break sessions):

- **Claude Code**: separate `scrooge-headroom` plugin — install it only when the binary exists.
- **Antigravity**: pre-registered in the plugin's `mcp_config.json` with `"disabled": true`; remove the key after installing the binary.
- **OpenCode**: the npm plugin registers the server at startup only when the binary is detected.
- **Others**: add manually per GUIDE §3 once the binary works.

1. Install the CLI: `pip install "headroom-ai[all]"` (Python 3.10+; or `uv tool install` / `pipx install`).
2. Restart the agent. Three tools become available:
   - `headroom_compress` — compress a large blob before it enters the context;
   - `headroom_retrieve` — fetch the original of a compressed block (reversible, cached with a TTL);
   - `headroom_stats` — compression metrics.

The `scrooge-hygiene` skill/rules instruct the agent to route oversized logs/files through `headroom_compress` when the server is configured.

## Alternative modes (not wired by scrooge-kit)

- **Proxy**: `headroom proxy --port 8787` is an OpenAI/Anthropic-compatible HTTP proxy; point `ANTHROPIC_BASE_URL`/`OPENAI_BASE_URL` at it for transparent wire compression. Powerful but per-agent base-URL support varies — spike it manually, compare with docs/benchmark.md.
- **Agent wrapping**: `headroom wrap` has presets for several agents; it overlaps with what scrooge-kit already wires, so pick one or the other.
