import { test } from "node:test";
import assert from "node:assert/strict";
import { rewriteCommand, PREFIXES } from "../shared/scripts/lib/policy.mjs";

test("rewrites plain dev commands", () => {
  assert.equal(rewriteCommand("git status"), "rtk git status");
  assert.equal(rewriteCommand("npm test"), "rtk npm test");
  assert.equal(rewriteCommand("  cargo build --release  "), "rtk cargo build --release");
});

test("preserves quoting and inner spacing", () => {
  assert.equal(
    rewriteCommand('git log --grep "two  words"'),
    'rtk git log --grep "two  words"',
  );
});

test("git: only the subcommands rtk handles are rewritten", () => {
  // in `rtk git` → rewritten (rtk condenses even push/commit)
  for (const c of [
    "git status", "git diff HEAD~1", "git log --oneline", "git show",
    "git add .", "git commit -m x", "git push", "git pull",
    "git branch", "git fetch", "git stash", "git worktree list",
  ])
    assert.equal(rewriteCommand(c), `rtk ${c}`, c);
  // not in `rtk git` → left alone (rtk has no handler; nudging wastes a turn)
  for (const c of [
    "git clone https://example.com/r.git", "git checkout main", "git switch -c x",
    "git merge dev", "git rebase main", "git reset --hard", "git remote -v",
    "git config user.name", "git init", "git tag v1", "git cherry-pick abc",
  ])
    assert.equal(rewriteCommand(c), null, c);
  // pre-command options don't hide the subcommand
  assert.equal(rewriteCommand("git -C /tmp/x status"), "rtk git -C /tmp/x status");
  assert.equal(rewriteCommand("git -c core.pager=cat log"), "rtk git -c core.pager=cat log");
  assert.equal(rewriteCommand("git --no-pager diff"), "rtk git --no-pager diff");
  assert.equal(rewriteCommand("git -C /tmp/x clone u"), null);
});

test("PREFIXES matches rtk's proxied tools, not the unsupported ones", () => {
  for (const p of ["git", "gh", "glab", "npm", "npx", "cargo", "docker", "kubectl", "oc", "aws", "pytest"])
    assert.ok(PREFIXES.includes(p), `should include ${p}`);
  for (const p of ["yarn", "bun", "make", "gradle", "bundle", "eslint", "curl", "playwright", "ls", "grep"])
    assert.ok(!PREFIXES.includes(p), `should NOT include ${p}`);
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

test("skips already-prefixed, piped, redirected, and non-dev commands", () => {
  assert.equal(rewriteCommand("rtk git status"), null);
  assert.equal(rewriteCommand("rtk"), null);
  assert.equal(rewriteCommand("git log | head -5"), null);
  assert.equal(rewriteCommand("echo $HOME"), null);
  assert.equal(rewriteCommand("ls -la"), null);
  assert.equal(rewriteCommand("git log\ngit status"), null);
});

test("&&-chains: wrap each dev segment, but only when safe to split", () => {
  // the reported case: a setup command chained before a dev command
  assert.equal(rewriteCommand("ulimit -n 10240 && npm install"), "ulimit -n 10240 && rtk npm install");
  assert.equal(rewriteCommand("cd foo && npm test"), "cd foo && rtk npm test");
  // every dev segment gets wrapped independently
  assert.equal(rewriteCommand("npm install && npm test"), "rtk npm install && rtk npm test");
  assert.equal(rewriteCommand("npm test && echo ok"), "rtk npm test && echo ok");
  assert.equal(rewriteCommand("git clone u && npm i"), "git clone u && rtk npm i");
  assert.equal(rewriteCommand("NODE_ENV=test npm test && npm i"), "NODE_ENV=test rtk npm test && rtk npm i");
  // no dev segment → nothing to do
  assert.equal(rewriteCommand("cd foo && echo done"), null);
  // any other operator, quotes, subshell, background, or redirect → bail entirely
  assert.equal(rewriteCommand("npm run build 2>&1 && npm test"), null);
  assert.equal(rewriteCommand("foo | npm test"), null);
  assert.equal(rewriteCommand("(cd x && npm test)"), null);
  assert.equal(rewriteCommand("npm test & npm start"), null);
  assert.equal(rewriteCommand('git commit -m "a && b" && npm test'), null);
  assert.equal(rewriteCommand("npm test && echo $HOME"), null);
  // per-segment bypass: SCROOGE_RAW applies to its own segment only; the other still wraps
  assert.equal(rewriteCommand("SCROOGE_RAW=1 npm test && npm i"), "SCROOGE_RAW=1 npm test && rtk npm i");
  // SCROOGE_RTK=off disables the whole line
  assert.equal(rewriteCommand("npm test && npm i", { SCROOGE_RTK: "off" }), null);
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
