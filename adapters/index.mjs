import * as claudeCode from "./claude-code.mjs";
import * as geminiCli from "./gemini-cli.mjs";
import * as antigravity from "./antigravity.mjs";
import * as codex from "./codex.mjs";
import * as opencode from "./opencode.mjs";
import * as grok from "./grok.mjs";
import * as cursor from "./cursor.mjs";
import * as windsurf from "./windsurf.mjs";

export const ADAPTERS = {
  "claude-code": claudeCode,
  "gemini-cli": geminiCli,
  antigravity,
  codex,
  opencode,
  grok,
  cursor,
  windsurf,
};
