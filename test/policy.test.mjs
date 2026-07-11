import { test } from "node:test";
import assert from "node:assert/strict";
import { rewriteCommand, PREFIXES } from "../payload/scripts/lib/policy.mjs";

test("rewrites plain dev commands", () => {
  assert.equal(rewriteCommand("git status"), "rtk git status");
  assert.equal(rewriteCommand("npm test"), "rtk npm test");
  assert.equal(rewriteCommand("  cargo build --release  "), "rtk cargo build --release");
});

test("preserves quoting and inner spacing", () => {
  assert.equal(
    rewriteCommand('git commit -m "two  words"'),
    'rtk git commit -m "two  words"',
  );
});

test("keeps env-assignment prefixes in place", () => {
  assert.equal(rewriteCommand("NODE_ENV=test npm test"), "NODE_ENV=test rtk npm test");
  assert.equal(rewriteCommand("A=1 B=2 git log"), "A=1 B=2 rtk git log");
});

test("honors bypasses", () => {
  assert.equal(rewriteCommand("SCROOGE_RAW=1 git status"), null);
  assert.equal(rewriteCommand("KIT_RAW=1 npm test"), null);
  assert.equal(rewriteCommand("git status", { SCROOGE_RTK: "off" }), null);
});

test("skips already-prefixed, compound, and non-dev commands", () => {
  assert.equal(rewriteCommand("rtk git status"), null);
  assert.equal(rewriteCommand("rtk"), null);
  assert.equal(rewriteCommand("git log | head -5"), null);
  assert.equal(rewriteCommand("npm test && echo ok"), null);
  assert.equal(rewriteCommand("echo $HOME"), null);
  assert.equal(rewriteCommand("ls -la"), null);
  assert.equal(rewriteCommand("git log\ngit status"), null);
});

test("handles junk input", () => {
  assert.equal(rewriteCommand(""), null);
  assert.equal(rewriteCommand(null), null);
  assert.equal(rewriteCommand(42), null);
});

test("prefix list covers the usual suspects", () => {
  for (const p of ["git", "npm", "pytest", "docker", "kubectl", "go"])
    assert.ok(PREFIXES.includes(p), p);
});
