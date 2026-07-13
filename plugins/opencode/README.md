# @sipki-tech/scrooge-kit-opencode

OpenCode plugin from [scrooge-kit](https://github.com/sipki-tech/scrooge-kit): rewrites `git status` → `rtk git status` in-process (60–90% terminal-output compression) and registers the Headroom MCP server when the `headroom` binary is present.

Install with OpenCode's own plugin command (writes the config for you):

```bash
opencode plugin @sipki-tech/scrooge-kit-opencode        # project config
opencode plugin -g @sipki-tech/scrooge-kit-opencode     # global config
```

Or add the entry manually:

```jsonc
// opencode.json
{
  "plugin": ["@sipki-tech/scrooge-kit-opencode"]
}
```

Needs the `rtk` binary (`brew install rtk`) to take effect; without it the plugin is a silent no-op. Bypass a single command with `SCROOGE_RAW=1 <cmd>`, or disable for the session with `SCROOGE_RTK=off`.
