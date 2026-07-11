import { readJson, writeJson } from "./fsutil.mjs";

// The headroom MCP entry every adapter registers. Ships disabled so a
// missing binary can't break sessions; adapters that know the binary is
// present register the enabled variant.
export const HEADROOM_SERVER = {
  command: "headroom",
  args: ["mcp", "serve"],
  disabled: true,
};

export function headroomEntry(available) {
  if (!available) return HEADROOM_SERVER;
  const { disabled, ...enabled } = HEADROOM_SERVER;
  return enabled;
}

// Non-destructive merge into an { [key]: { name: def } } config file:
// never touches a server the user already configured.
export function mergeMcpServers(journal, file, servers, { key = "mcpServers" } = {}) {
  const existing = readJson(file, {});
  const merged = { ...existing, [key]: { ...(existing[key] ?? {}) } };
  let changed = false;
  for (const [name, def] of Object.entries(servers)) {
    if (merged[key][name]) continue;
    merged[key][name] = def;
    changed = true;
  }
  if (changed) writeJson(journal, file, merged);
  return changed;
}

// Only remove entries identical to a form we could have installed
// (disabled or enabled variant); anything the user edited stays.
export function pruneMcpServers(journal, file, servers, { key = "mcpServers" } = {}) {
  const existing = readJson(file);
  if (!existing?.[key]) return false;
  let changed = false;
  for (const [name, def] of Object.entries(servers)) {
    const current = existing[key][name];
    if (!current) continue;
    const { disabled, ...enabledVariant } = def;
    const installedForms = [JSON.stringify(def), JSON.stringify(enabledVariant)];
    if (installedForms.includes(JSON.stringify(current))) {
      delete existing[key][name];
      changed = true;
    }
  }
  if (changed) writeJson(journal, file, existing);
  return changed;
}
