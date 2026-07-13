// Shared stdin/stdout plumbing for hook handlers.
// Contract: hooks are fail-open — any internal error must resolve to a no-op
// response with exit code 0, never break the host session. Response dialects
// differ per host and are produced by the caller; this module only moves JSON.

// Empty object = successful no-op for every known host dialect.
export const SILENT = {};

// Antigravity decision dialect (official 2026-07 + legacy keys).
export const ALLOW = { decision: "allow", allow_tool: true };

export function denyResponse(reason) {
  return { decision: "deny", reason, allow_tool: false, deny_reason: reason };
}

export async function readStdinJson(timeoutMs = 3000) {
  const chunks = [];
  const raw = await new Promise((resolve) => {
    const finish = () => resolve(Buffer.concat(chunks).toString("utf8"));
    const timer = setTimeout(finish, timeoutMs);
    timer.unref?.();
    process.stdin.on("data", (c) => chunks.push(c));
    process.stdin.on("end", () => {
      clearTimeout(timer);
      finish();
    });
    process.stdin.on("error", () => {
      clearTimeout(timer);
      finish();
    });
  });
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { _raw: raw };
  }
}

export function respond(payload) {
  process.stdout.write(JSON.stringify(payload) + "\n");
}

export async function runHook(handler, fallback = SILENT) {
  let out = null;
  try {
    const input = await readStdinJson();
    out = await handler(input);
  } catch {
    out = null;
  }
  respond(out ?? fallback);
  process.exit(0);
}

// Input shapes vary across hosts; probe the known variants.
//   Claude Code / Codex / Gemini CLI / Grok: { tool_name, tool_input: { command } }
//   Antigravity:                              { toolCall: { args: { CommandLine } } }
export function commandLineOf(input) {
  const args =
    input?.tool_input ??
    input?.toolCall?.args ??
    input?.tool_call?.args ??
    input?.args ??
    {};
  return args.command ?? args.CommandLine ?? args.commandLine ?? args.cmd ?? "";
}

export function toolInputOf(input) {
  return (
    input?.tool_input ??
    input?.toolCall?.args ??
    input?.tool_call?.args ??
    input?.args ??
    {}
  );
}
