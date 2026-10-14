/**
 * `folio` command line. Each command lives in its own module; this file only
 * dispatches. Exit codes: 0 even with warnings, 1 only when `--max-warnings` or
 * `--fail-on` asks for it, 2 for usage or internal faults.
 */
import { COMMANDS, usage } from "./commands.js";

/**
 * Run the command named in argv.
 *
 * @param argv - arguments after the script name.
 * @returns the exit code.
 */
async function main(argv: string[]): Promise<number> {
  const [name, ...rest] = argv;
  const command = name ? COMMANDS[name] : undefined;
  if (!command) {
    process.stderr.write(usage());
    return name && name !== "help" && name !== "--help" ? 2 : 0;
  }
  try {
    return await command(rest);
  } catch (error) {
    process.stderr.write(`folio ${name}: ${(error as Error).message}\n`);
    return 2;
  }
}

process.stdout.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EPIPE") process.exit(0);
});

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    process.stderr.write(`${error}\n`);
    process.exitCode = 2;
  },
);
