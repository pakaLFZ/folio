/**
 * Kill a hook process and everything it started. On Linux and macOS the hook
 * runs as the leader of its own process group (spawned `detached`), and the
 * group is killed by its negative pid. Windows has no process groups to
 * signal: `process.kill(-pid)` throws there, so the tree is ended with
 * `taskkill /T /F` instead.
 */
import { execFile } from "node:child_process";

/**
 * Kill a process and its children; a process already gone is not an error.
 *
 * @param pid - the hook's process id (the group leader on POSIX).
 */
export function killTree(pid: number | undefined): void {
  if (pid === undefined) return;
  if (process.platform === "win32") {
    execFile("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true }, () => {});
    return;
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    /* already gone */
  }
}
