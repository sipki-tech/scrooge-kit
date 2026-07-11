import { join } from "node:path";

export const KIT_NAME = "scrooge-kit";

// Every hook command we install carries this token so install/uninstall can
// recognize our entries inside configs we do not own.
export const HOOK_TAG = "scrooge-kit";

export function rewriterCommand(payloadDir, dialect) {
  return `node "${join(payloadDir, "scripts", "rtk-rewriter.mjs")}" ${dialect}`;
}

export function isOurs(entry) {
  return JSON.stringify(entry ?? "").includes(HOOK_TAG);
}

// Claude-style hooks config: { hooks: { PreToolUse: [ { matcher, hooks: [...] } ] } }
// Used verbatim by Claude Code and mirrored (best-effort) by Grok.
export function addClaudeStyleHook(settings, event, matcher, command, timeout = 10) {
  const next = { ...settings, hooks: { ...(settings.hooks ?? {}) } };
  const entries = [...(next.hooks[event] ?? [])];
  if (entries.some(isOurs)) return { settings, changed: false };
  entries.push({
    matcher,
    hooks: [{ type: "command", command, timeout }],
  });
  next.hooks[event] = entries;
  return { settings: next, changed: true };
}

export function removeClaudeStyleHooks(settings, event) {
  if (!settings?.hooks?.[event]) return { settings, changed: false };
  const entries = settings.hooks[event];
  const kept = entries.filter((e) => !isOurs(e));
  if (kept.length === entries.length) return { settings, changed: false };
  const next = { ...settings, hooks: { ...settings.hooks, [event]: kept } };
  if (kept.length === 0) delete next.hooks[event];
  if (Object.keys(next.hooks).length === 0) delete next.hooks;
  return { settings: next, changed: true };
}
