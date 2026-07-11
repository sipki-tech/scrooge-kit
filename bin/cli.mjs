#!/usr/bin/env node
// scrooge-kit — cross-agent token-saving kit.
// install|update|uninstall|verify|status  [--agent <name>|all] [--dry-run]
//                                         [--with-rtk] [--with-headroom] [--statusline]

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { copyDir, createJournal, readJson, removeDir } from "../core/fsutil.mjs";
import { AGENT_NAMES, binaryAvailable, detectAgents } from "../core/detect.mjs";
import { installRtk } from "../core/tools/rtk.mjs";
import { installHeadroom } from "../core/tools/headroom.mjs";
import { runUsageReport } from "../core/tools/ccusage.mjs";
import { ADAPTERS } from "../adapters/index.mjs";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_PAYLOAD = join(PACKAGE_ROOT, "payload");

export function installedPayloadDir(home = homedir()) {
  return join(home, ".scrooge-kit");
}

function parseArgs(argv) {
  const opts = {
    command: argv[0],
    agents: null,
    dryRun: false,
    withRtk: false,
    withHeadroom: false,
    statusline: false,
    home: homedir(),
  };
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--agent") opts.agents = argv[++i];
    else if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--with-rtk") opts.withRtk = true;
    else if (arg === "--with-headroom") opts.withHeadroom = true;
    else if (arg === "--statusline") opts.statusline = true;
    else if (arg === "--home") opts.home = argv[++i]; // tests only
    else throw new Error(`Unknown option: ${arg}`);
  }
  return opts;
}

function resolveAgents(opts, { forInstall = false } = {}) {
  if (!opts.agents || opts.agents === "all") {
    const detected = detectAgents(opts.home);
    if (forInstall && detected.length === 0)
      throw new Error("No agents detected on this machine. Use --agent <name> to force one.");
    return detected;
  }
  const names = opts.agents.split(",").map((s) => s.trim());
  for (const name of names) {
    if (!AGENT_NAMES.includes(name))
      throw new Error(`Unknown agent '${name}'. Known: ${AGENT_NAMES.join(", ")}`);
  }
  return names;
}

function makeCtx(opts, journal, extras = {}) {
  return {
    home: opts.home,
    journal,
    payloadDir: installedPayloadDir(opts.home),
    version: readJson(join(PACKAGE_ROOT, "package.json"), { version: "0.0.0" }).version,
    opts,
    log: console.log,
    ...extras,
  };
}

function printJournal(journal) {
  for (const a of journal.actions) console.log(`  [${a.type}] ${a.target}`);
  if (journal.dryRun) console.log(`  (dry-run: ${journal.actions.length} actions, nothing written)`);
}

export function install(opts) {
  const agents = resolveAgents(opts, { forInstall: true });
  const journal = createJournal(opts.dryRun);

  if (opts.withRtk) installRtk({ dryRun: opts.dryRun });
  if (opts.withHeadroom) installHeadroom({ dryRun: opts.dryRun });
  const headroomAvailable = binaryAvailable("headroom");

  // Single shared payload copy — every agent's hooks reference it.
  removeDir(journal, installedPayloadDir(opts.home));
  copyDir(journal, SOURCE_PAYLOAD, installedPayloadDir(opts.home));

  for (const name of agents) {
    console.log(`\n=== ${name} ===`);
    ADAPTERS[name].install(makeCtx(opts, journal, { headroomAvailable }));
  }
  printJournal(journal);
  console.log(`\nscrooge-kit installed for: ${agents.join(", ")}`);
  if (!binaryAvailable("rtk"))
    console.log("note: rtk is not installed — hooks stay dormant until it is (re-run with --with-rtk).");
  if (!headroomAvailable)
    console.log("note: headroom is not installed — MCP entries registered disabled (re-run with --with-headroom).");
  return { agents, actions: journal.actions };
}

export function uninstall(opts) {
  const agents = resolveAgents(opts);
  const journal = createJournal(opts.dryRun);
  for (const name of agents) {
    console.log(`\n=== ${name} ===`);
    ADAPTERS[name].uninstall(makeCtx(opts, journal));
  }
  removeDir(journal, installedPayloadDir(opts.home));
  printJournal(journal);
  console.log(`\nscrooge-kit removed for: ${agents.join(", ")}`);
  return { agents, actions: journal.actions };
}

export function verify(opts) {
  const agents = resolveAgents(opts);
  let allPass = true;
  for (const name of agents) {
    console.log(`\n=== ${name} ===`);
    const checks = ADAPTERS[name].verify(makeCtx(opts, createJournal(true)));
    for (const c of checks) {
      console.log(`  ${c.pass ? "ok " : "FAIL"} ${c.name}${c.note ? ` — ${c.note}` : ""}`);
      if (!c.pass) allPass = false;
    }
  }
  const payloadOk = existsSync(join(installedPayloadDir(opts.home), "scripts", "rtk-rewriter.mjs"));
  console.log(`\n  ${payloadOk ? "ok " : "FAIL"} shared payload at ${installedPayloadDir(opts.home)}`);
  for (const tool of ["rtk", "headroom"]) {
    console.log(`  info optional tool ${tool}: ${binaryAvailable(tool) ? "installed" : "not installed"}`);
  }
  if (!allPass || !payloadOk) process.exitCode = 1;
  return allPass && payloadOk;
}

export function status(opts) {
  const detected = detectAgents(opts.home);
  console.log(`agents detected: ${detected.join(", ") || "none"}`);
  console.log(`rtk: ${binaryAvailable("rtk") ? "installed" : "not installed"}`);
  console.log(`headroom: ${binaryAvailable("headroom") ? "installed" : "not installed"}`);
  console.log("");
  runUsageReport();
}

const HELP = `scrooge-kit — cross-agent token-saving kit

Usage: scrooge-kit <command> [options]

Commands:
  install     Install hooks/skills/MCP for agents (default: all detected)
  update      Alias of install (clean re-install)
  uninstall   Remove everything scrooge-kit added (user edits preserved)
  verify      Check the installation per agent
  status      Detected agents, tool availability, token spend via ccusage

Options:
  --agent <name>|all   Target agents (comma-separated). Known: ${AGENT_NAMES.join(", ")}
  --dry-run            Print the action plan without touching anything
  --with-rtk           Also install the rtk binary
  --with-headroom      Also install the headroom CLI
  --statusline         (claude-code) set a ccusage statusline if none is set
`;

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    const opts = parseArgs(process.argv.slice(2));
    switch (opts.command) {
      case "install":
      case "update":
        install(opts);
        break;
      case "uninstall":
        uninstall(opts);
        break;
      case "verify":
        verify(opts);
        break;
      case "status":
        status(opts);
        break;
      default:
        console.log(HELP);
        if (opts.command) process.exitCode = 1;
    }
  } catch (err) {
    console.error(`error: ${err.message}`);
    process.exitCode = 1;
  }
}
