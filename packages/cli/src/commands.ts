/**
 * The command table and the usage text.
 */
import { initDeckCommand, newCommand, patchCommand, promptCommand, showCommand } from "./deckcmds.js";
import { answersCommand, askCommand } from "./askcmds.js";
import { checkCommand } from "./check.js";
import { layoutsCommand } from "./layoutscmd.js";
import { deckCommand } from "./deckexport.js";
import { overrideCommand, slideCommand } from "./overridecmd.js";
import { ackCommand, codesCommand, packCommand } from "./packcmds.js";
import { pdfCommand } from "./pdf.js";
import { pptxCommand } from "./pptx.js";
import { commentCommand, commentsCommand, inboxCommand } from "./commentcmds.js";
import { queueCommand, runHookCommand } from "./queuecmds.js";
import { hookCommand, traceCommand } from "./hookcmds.js";
import { blockCommand } from "./blockcmd.js";
import { boxCommand } from "./boxcmd.js";
import { pyCommand } from "./pycmd.js";
import { doctorCommand } from "./doctor.js";
import { serveCommand } from "./serve.js";
import { stopCommand } from "./homecmd.js";
import { openCommand, restartCommand } from "./opencmd.js";
import { shapeCommand } from "./shapecmd.js";
import { textCommand } from "./textcmd.js";
import { shotCommand } from "./shot.js";
import { statusCommand } from "./status.js";
import { viewingCommand } from "./viewingcmd.js";
import { eventWatchCommand } from "./eventwatch.js";
import { quickstartCommand, skillCommand } from "./skillcmd.js";
import { vocabCommand } from "./vocabcmds.js";
import { undoCommand } from "./undocmd.js";

export type Command = (args: string[]) => Promise<number>;

export const COMMANDS: Record<string, Command> = {
  serve: serveCommand,
  stop: stopCommand,
  restart: restartCommand,
  open: openCommand,
  doctor: doctorCommand,
  "init-deck": initDeckCommand,
  new: newCommand,
  patch: patchCommand,
  show: showCommand,
  override: overrideCommand,
  slide: slideCommand,
  undo: (args) => undoCommand(args, "undo"),
  redo: (args) => undoCommand(args, "redo"),
  shape: shapeCommand,
  block: blockCommand,
  text: textCommand,
  prompt: promptCommand,
  layouts: layoutsCommand,
  vocab: vocabCommand,
  check: checkCommand,
  pdf: pdfCommand,
  pptx: pptxCommand,
  deck: deckCommand,
  shot: shotCommand,
  pack: packCommand,
  ack: ackCommand,
  codes: codesCommand,
  status: statusCommand,
  viewing: viewingCommand,
  watch: eventWatchCommand,
  skill: skillCommand,
  quickstart: quickstartCommand,
  queue: queueCommand,
  comments: commentsCommand,
  comment: commentCommand,
  inbox: inboxCommand,
  ask: askCommand,
  answers: answersCommand,
  "run-hook": runHookCommand,
  hook: hookCommand,
  trace: traceCommand,
  box: boxCommand,
  py: pyCommand,
};

/**
 * The usage text.
 *
 * @returns one line per command.
 */
export function usage(): string {
  return [
    "usage: folio <command> [options]",
    "",
    "  (no command)                                   in a terminal: open the deck list, starting the server in the background;",
    "                                                 outside a workspace, the default one ($FOLIO_HOME, ~/Documents/folio)",
    "  stop [workspace]                               stop the workspace's server and wait until it is gone",
    "  doctor [path] [--json]                         check this machine: Node, web build, Chromium, Python and matplotlib,",
    "                                                 workspace, port; each failure with the command that fixes it (exit 1)",
    "  serve [workspace|deck] [--port N] [--expose] [--open]  serve every deck of the workspace; the port is held",
    "                                                 across restarts; --open asks VS Code to forward it and open the deck list",
    "  restart [workspace]                            reload the app behind the running server's port; the port never closes",
    "  open [deck]                                    ask VS Code to forward the server's port and open the deck (or the list)",
    "                                                 on the user's machine; exit 1 with the manual step when no VS Code answers",
    "  init-deck <dir> [--template PACK@V] [--title T]  create a deck; without --template, the built-in pack plain@1",
    "  new <deck> --template LAYOUT [--props FILE|-] [--after ID] [--worker W]",
    "                                                 add a slide with the next free id, filled from --props {slot: content} in one write",
    "  layouts <deck> [--json] [LAYOUT ...]           every layout of the deck's pack: slide size, each slot's box in pt, role and limits",
    "  patch <deck>/<id> <patch.json|-> [--rev R]     apply an RFC 6902 patch (exit 3 on a stale rev)",
    "  show <deck>/<id>                               print a slide and its revision",
    "  override <deck>/<id> [PATH=JSON ...] [--clear PATH] [--clear-all]  read, set or clear the slide's overrides of its template",
    "  slide rm <deck> <id>[,<id>...]                 archive slides (never deleted; moved to slides/.archive/<date>/)",
    "  slide restore <deck> <id>                      restore the newest archived copy at its old place",
    "  undo <deck> | redo <deck>                      undo or redo the user's last deck write",
    "  slide move <deck> <id> --to N | --after ID | --before ID  reorder one slide",
    "  slide dup <deck> <id> [--after ID]             duplicate a slide, by default right after itself",
    "  slide list <deck> [--json]                     id, layout, title text and warning count, in presentation order",
    "  slide promote <deck> <id> --as NAME [--keep-slide]  save the slide's overrides as a new layout of the pack",
    "  slide promote <deck> <id> --into-layout --all-slides  apply them to the slide's layout, for every slide using it",
    "  shape add <deck>/<id> rect|ellipse|circle|arrow|line --box x,y,w,h [--from x,y --to x,y] [--fill C] [--stroke C] [--text T] [--style S]",
    "                                                 add the next free shape:<letter> slot and its shape in one write; prints the slot",
    "  shape rm <deck>/<id> shape:a                   remove a shape: its added slot and its content",
    "  block add <deck>/<id> --style S --box x,y,w,h [--text T | --code-file F --language L] [--columns N]",
    "                                                 add the next free block:<letter> slot (a text box or code block) in one write; prints the slot",
    "  block rm <deck>/<id> block:a                   remove a block: its added slot and its content",
    "  text add <deck>/<id> --box x,y,w,h [--text T] [--size PT] [--font F] [--color C] [--fill C] [--border C]",
    "                                                 add the next free text:<letter> box (a body text slot) in one write; prints the slot",
    "  text rm <deck>/<id> text:a                     remove a text box: its added slot and its words",
    "  prompt <deck>                                  print the agent instructions for the deck's pack, and its vocabulary bank",
    "  vocab show <deck> [--resolved] [--json]        the deck's vocabulary bank: its files, its own words; --resolved the effective bank by origin",
    "  vocab init <deck> [--from <deck|pack>]         make decks/<deck>/vocabulary.md inheriting the pack's bank, or a copy of another bank",
    "  vocab inherit <deck> <deck|pack>               add a bank to what the deck's bank inherits (nearest first)",
    "  vocab import <deck> <file.md|deck|pack>        merge words and section lines in; duplicates skipped, conflicts named",
    "  vocab add <deck> --use T --never \"a, b\" [--quote Q] [--slide sNNN]  add a word row dated today",
    "  vocab edits <deck> [--since DATE] [--json]     the user's text rewrites recorded by the editor, oldest first",
    "  vocab export <deck>                            the resolved bank as one text block for an agent's brief",
    "  check <deck> [--json|--sarif|--format github]  render headless and list every warning (exit 0)",
    "  pdf <deck> [--out F] [--wait S] [--slides ..]  wait for hook figures, then write the PDF",
    "  pptx <deck> [--out F] [--slides ids]          write editable PowerPoint slides; report picture approximations",
    "  deck export <deck> [--out F | --dir D] [--with-comments] [--without-cache] [--pdf]",
    "                                                 one <deck>.folio.zip: the deck, its pack, the hook cache (figures show without",
    "                                                 Python), manifest.json (every page's layout, title, slots; warnings; sha256 per file)",
    "  deck archive <deck> | deck unarchive <deck>    hide a deck from the landing page, or bring it back (deck.json archived flag)",
    "  deck import <file.folio.zip> [--into WS] [--name N] [--pack-as P]  verify every sha256, then install the deck and its pack",
    "  shot <deck> [--slides s001,s010-s020] [--pages 1-10,42] [--changed] [--warned [--notes]] [--out DIR] [--width PX]",
    "       [--sheet] [--per-sheet N] [--marks] [--drafts] [--wait S] [--json]",
    "                                                 one PNG per slide in <deck>/.shots/ (960 px); --changed only slides changed since",
    "                                                 the last shot; --warned only slides with warnings or errors; --sheet adds",
    "                                                 sheet-1.png, ... (12 slides each) labelled with layout and findings;",
    "                                                 --marks outlines slots and their findings; --drafts (or --marks) shows the user's drafts",
    "  status [path] [--json]                         open comments, counts and stored warnings, no rendering",
    "  viewing [path] [--json] [--wait-change [--since V]] [--timeout S]  the deck, slide and selection open in the editor now,",
    "                                                 most recently active visible tab first; --wait-change waits for the next change,",
    "                                                 or the first after --since V (the version --json gave); exit 4 at --timeout",
    "  watch [path] [--deck D] [--for comments,answers,viewing] [--since TIME] [--once] [--timeout S] [--json]",
    "                                                 one line per comment, thread message, reopen, hold or answer from the user,",
    "                                                 never an agent's own; runs until killed; --once exits 0 after the first line;",
    "                                                 --since TIME (a line's first field) prints what came after it first; exit 4 at --timeout",
    "  skill show | install [--project | --user] [--force]  the folio agent skill: print it, or copy its folder to .claude/skills/folio/",
    "  quickstart                                     a worked example: init-deck, slides with a picture and a table, shot, check, pptx",
    "  comments <deck> [--json] [--all]               open comments: slots, thread, turn, screenshot paths",
    "  comment reply <cid> \"text\" [--attach F]...   reply as --worker W (default agent); --answered marks it done",
    "  comment next [--worker W]                      claim the top card of the queue and print it",
    "  comment search \"QUERY\" [--deck D] [--slide S] [--slot X] [--status S[,S]] [--author A] [--since DATE] [--limit N] [--json]",
    "                                                 search every comment, any status, the whole chat and file names",
    "  comment show <cid> [--json]                    a comment's whole chat, archived or not",
    "  comment reshoot <cid>|--all [path] [--force]   re-take screenshots without the selection border",
    "  comment follow|unfollow <cid> [--worker W]     follow a comment's chat",
    "  comment watch <cid>|--following [--until-reply] [--timeout S]  print new messages as JSON lines",
    "  comment answered <cid> | assign <cid> <worker> mark done for the user to review, or take a comment",
    "  inbox [--deck D] [--status open|queue|progress|review|held|done] [--json]  the board as a list",
    "  ask <deck> [--comment C] [--file q.json] [--worker W]  ask the user a questionnaire in comment C's chat (a new",
    "                                                 conversation without --comment; stdin without --file); prints its id",
    "  ask --withdraw <id>                            withdraw a questionnaire that no longer matters",
    "  answers [<deck>] <id> [--wait] [--timeout S]   the answers as JSON; --wait blocks until the user submits",
    "  queue [path] [--json]                          hook jobs running, queued, paused and failed",
    "  queue resume <hook>                            re-arm a paused hook",
    "  run-hook <deck>/<slide>/<slot>                 run one hook in the foreground, full output",
    "  hook list | show <pack>/<hook> [--json]        a pack's hooks: inputs schema, example, how to run one",
    "  hook run <pack>/<hook> --inputs F|- --size W,H [--unit pt|mm|in] [--dpi N] [--format png|svg|pdf] --out FILE [--deck D] [--fresh] [--json]",
    "                                                 call a hook without a deck; --inputs may be a trace record",
    "  trace <deck>/<slide> <slot> [--json]           what made the slot's figure, and the line that makes it again",
    "  box <deck>/<slide> <slot> [--json]             the slot's box now in pt and inches: draw a script's figure at it",
    "  py <script.py> [args]                          run a script with the workspace's Python and folio_hook importable",
    "",
    "  ack <warning-id> --reason R [--until DATE]     acknowledge a warning (it expires and lapses when it changes)",
    "  codes                                          every warning code, as Markdown",
    "  pack guide                                     how to turn a pptx into a pack, merge, edit and export: read it first",
    "  pack schema | check <dir>                      the pack.json JSON Schema, or validate a pack folder",
    "  pack import <file.pptx> --name P [--from-slides]  a draft pack from a pptx's master (and slides), with import-report.md",
    "  pack import <dir|git-url>                      validate and install a pack folder",
    "  pack merge <src> <dst> [--layouts a,b] [--rename a=b]  copy layouts and what they use; clashes refused",
    "  pack edit <pack> layout add|rename|remove ... | set <path>=<json>  scripted edits; decks protected, version kept or bumped",
    "  pack export <pack|deck> [--out DIR] [--zip F] [--pptx F]  a folder, a zip, or a pptx whose master reproduces the pack",
    "",
    "  report flags: --all (include acknowledged), --max-warnings N, --fail-on new (exit 1 when exceeded)",
    "",
  ].join("\n");
}
