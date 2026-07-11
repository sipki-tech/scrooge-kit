// Re-export: the runtime copy lives in the payload (shipped with hooks);
// installer-side code imports it from here.
export { PREFIXES, rewriteCommand } from "../payload/scripts/lib/policy.mjs";
