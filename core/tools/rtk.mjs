import { execSync } from "node:child_process";
import { binaryAvailable } from "../detect.mjs";

// --with-rtk: install the rtk binary. Hook wiring is owned by scrooge-kit's
// own adapters (uniform policy and SCROOGE_RAW bypass across agents), so we
// intentionally do NOT run `rtk init` / `rtk hook <agent>` here.
export function installRtk({ dryRun = false, log = console.log } = {}) {
  if (binaryAvailable("rtk")) {
    log("rtk: already installed");
    return true;
  }
  if (dryRun) {
    log("rtk: would install via `brew install rtk` (or the official curl script)");
    return false;
  }
  if (binaryAvailable("brew")) {
    log("rtk: installing via Homebrew…");
    execSync("brew install rtk", { stdio: "inherit" });
  } else {
    log("rtk: installing via official script…");
    execSync(
      "curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh",
      { stdio: "inherit" },
    );
  }
  const ok = binaryAvailable("rtk");
  if (!ok) log("rtk: binary still not on PATH — install it manually (https://github.com/rtk-ai/rtk)");
  return ok;
}
