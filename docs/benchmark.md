# Token benchmark protocol

Acceptance criterion: ≥50% reduction in context spent on terminal command output on a reference session, with zero missed failing tests caused by compression.

## Reference session

Run the same three tasks twice on the same repository, agent, and model — once with token optimization off, once with it on:

1. **Feature**: add a small feature with tests (touches 2–3 files).
2. **Debug**: fix a planted failing test with a non-obvious cause.
3. **Refactor**: rename/extract across several files with the suite green before and after.

## Procedure

1. **Baseline run**: fresh session, scrooge-kit hooks disabled (`SCROOGE_RTK=off` in the agent's environment), headroom MCP disabled. Complete the three tasks. Record per-task: total tokens (from the host's usage HUD or `scrooge-kit status`), number of terminal commands, approximate tokens of command output (sum of tool-result sizes).
2. **Optimized run**: fresh session, scrooge-kit installed and rtk on PATH, headroom MCP enabled. Same tasks, same prompts. Record the same numbers.
3. `rtk gain` (if available in your rtk version) reports measured savings per command category — attach it. `headroom_stats` reports compression metrics for the MCP path.

## Metrics

| Metric | Baseline | Optimized | Target |
| --- | --- | --- | --- |
| Tokens spent on terminal output | — | — | −50% or better |
| Total session tokens | — | — | informational |
| Failing tests missed due to compression | 0 | — | must stay 0 |

## Quality regression check

For every test run inside the optimized session, cross-check the compressed output against the raw run (`SCROOGE_RAW=1 <command>`): every failure visible raw must be visible compressed. One missed failure fails the acceptance.
