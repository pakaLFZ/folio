// Run a command with a time limit, the same on Linux, macOS and Windows (GNU timeout is not on macOS):
// node e2e/lib/timeout.mjs SECONDS command [args ...]. The command runs in its own process group; at the limit
// the whole group is killed and the exit code is 124, as GNU timeout's. Otherwise the command's own code.
import { spawn, spawnSync } from "node:child_process";

const [seconds, command, ...args] = process.argv.slice(2);
if (!Number(seconds) || !command) {
  console.error("usage: node e2e/lib/timeout.mjs SECONDS command [args ...]");
  process.exit(2);
}
const windows = process.platform === "win32";
const child = spawn(command, args, { stdio: "inherit", detached: !windows, shell: windows });
let timedOut = false;

function killGroup() {
  if (windows) spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
  else {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
  }
}

const timer = setTimeout(() => {
  timedOut = true;
  console.error(`timeout: ${command} ran past ${seconds} s; its process group was killed`);
  killGroup();
}, Number(seconds) * 1000);
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => (killGroup(), process.exit(130)));
child.on("exit", (code, signal) => {
  clearTimeout(timer);
  process.exit(timedOut ? 124 : (code ?? (signal ? 128 : 1)));
});
