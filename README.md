# folio

[![skills.sh](https://skills.sh/b/pakaLFZ/folio)](https://skills.sh/pakaLFZ/folio)

An agent-first slide framework. Slides are JSON files filled into portable template packs; a browser shows every edit live, reports text that overflows its slot, draws figures from plot hooks, and carries region comments that agents read and answer. Output is PDF.

Built on [json-render](https://github.com/vercel-labs/json-render) (the catalog, the flat spec, JSON Patch). Licence: Apache-2.0.

## Run it

The quickest way, with Python 3.9 or later and pip:

```sh
pip install folio-deck
folio
```

Or with Node 20:

```sh
npm install -g https://github.com/pakaLFZ/folio/releases/latest/download/folio.tgz
folio
```

Neither install downloads Chromium; the first run does, once, with Playwright's own progress bar (`FOLIO_NO_BROWSER_DOWNLOAD=1` refuses instead and names the manual command). To do it ahead of time: `python -m playwright install chromium` (pip) or `npx playwright install chromium` (npm).

`folio` alone opens the deck list in your browser, starting the server in the background (`folio stop` stops it). Outside a workspace it uses `~/Documents/folio`, made on first use. The same minimal release is on the [releases](https://github.com/pakaLFZ/folio/releases) page as a zip, and on [PyPI](https://pypi.org/project/folio-deck/) as the `folio-deck` wheel (the name `folio` was already taken). The steps below run folio from a clone of the sources.

You need Node 20 or later, pnpm (through corepack, which comes with Node), and a Python 3.9 or later with matplotlib for plot hooks. From a clone of this repository:

**macOS** (Homebrew)

```sh
brew install node@20 python
export PATH="$(brew --prefix node@20)/bin:$PATH"    # node@20 is keg-only; add this line to ~/.zshrc
corepack enable                                    # pnpm at the version package.json names (or: npm install -g pnpm@10)
python3 -m venv .venv && .venv/bin/python -m pip install matplotlib
printf '[runtimes]\npython = ".venv/bin/python"\n' > folio.local.toml
pnpm install
pnpm build:web                                     # folio downloads Chromium on first use; to do it ahead: pnpm exec playwright install chromium
node packages/cli/bin/folio.mjs doctor
node packages/cli/bin/folio.mjs serve .            # open http://localhost:4310
```

**Linux** (Debian or Ubuntu; any distribution with Node 20 works)

```sh
# Node 20: from your distribution, nodesource, or nvm (nvm install 20)
sudo apt install python3 python3-matplotlib
corepack enable
pnpm install
pnpm build:web                                      # folio downloads Chromium on first use; to do it ahead: pnpm exec playwright install --with-deps chromium
node packages/cli/bin/folio.mjs doctor
node packages/cli/bin/folio.mjs serve .
```

**Windows** (PowerShell)

```powershell
winget install OpenJS.NodeJS.LTS
winget install Python.Python.3.12                  # then open a new PowerShell, so both are on PATH
py -3 -m pip install matplotlib
corepack enable
pnpm install
pnpm build:web                                     # folio downloads Chromium on first use; to do it ahead: pnpm exec playwright install chromium
node packages/cli/bin/folio.mjs doctor
node packages/cli/bin/folio.mjs serve .
```

`folio doctor` checks Node, the web build, Chromium, Python and matplotlib, the workspace and the port, and prints the command that fixes each failure. Without `[runtimes] python` in `folio.local.toml`, hooks run with the first of `python3`, `python` and (Windows) `py -3` on PATH that is Python 3.9 or later; `folio doctor` and `folio queue` say which one. The server serves every deck under `/<deck8>/`.

On a remote machine, forward the port once: `ssh -L 4310:localhost:4310 host`, or let VS Code Remote-SSH forward it. The server tries 4310 to 4313 and records the one it took in `.folio/server.json`.

Machine-specific settings go in `folio.local.toml` (git-ignored), for example the interpreter hooks run with (absolute, `~/...`, or relative to the folder holding `folio.toml`):

```toml
[runtimes]
python = "/path/to/python"
```

## For agents

An agent needs only the folio skill, `skills/folio-deck/`: it says how to install folio, set up a workspace, write slides and answer the user's comments. Install it into a workspace with `folio skill install` (or `--user`), or from this repository with any Agent Skills installer: `npx skills add pakaLFZ/folio` ([skills.sh/pakalfz/folio](https://www.skills.sh/pakalfz/folio)).

Start with the instructions generated from the deck's pack; they list every layout, slot, line limit, character rule and hook input:

```sh
folio prompt decks/example
```

| Task | Command |
|---|---|
| Add a slide | `folio new decks/D --template note-figure --worker w1 [--props JSON]` |
| Change a slide | `folio patch decks/D/s003 patch.json --rev REV --worker w1` (RFC 6902; exit 3 on a stale revision) |
| Read a slide | `folio show decks/D/s003` |
| Check everything | `folio check decks/D [--json|--sarif|--format github]` (exit 0; `--max-warnings N`, `--fail-on new`) |
| See what stands | `folio status` (open comments first, then counts and warnings) |
| Make the PDF | `folio pdf decks/D [--out F]` |
| Take the next task | `folio comment next --worker w1` |
| Answer a comment | `folio comment reply CID "text" [--attach FILE] [--answered] --worker w1` |
| Wait for the user | `folio comment watch CID --worker w1 --until-reply` |
| Search any comment | `folio comment search "QUERY" [--deck D] [--slot X] [--status open,held,resolved] [--author A] [--since DATE] [--json]` (every deck and status, the whole chat and file names) |
| Read a whole chat | `folio comment show CID [--json]` |
| Ask the user a decision only they can make | `folio ask decks/D --file q.json --worker w1` (prints the id; kinds single, multi, text, long) |
| Read or wait for the answers | `folio answers decks/D QID [--wait] [--timeout S]` (JSON); `folio ask --withdraw QID` |
| Hook jobs | `folio queue`, `folio queue resume HOOK`, `folio run-hook decks/D/s003/fig:a` |
| Accept a warning | `folio ack ID --reason "..." [--until DATE]` |
| Packs | `folio pack schema | check DIR | export DECK | import DIR` |

Text never shrinks to fit. A slot that holds more lines than its limit is a warning (`FOLIO-OVF-001`); shorten the text. Every code is listed in [docs/warnings.md](docs/warnings.md).

Python workers can use `folio_client` (`python/`), which speaks the same HTTP API; plot hooks use `folio_hook`.

## Layout

| Path | What it holds |
|---|---|
| `packages/core` | Pure logic: pack schema, catalog and prompt, warnings, overflow, hooks, queue decisions, comments, inbox, stream helpers |
| `packages/server` | HTTP, SSE, file watchers, deck files, hook runner and queue, comments, screenshots |
| `packages/cli` | The `folio` command |
| `packages/web` | The editor, the print page and the inbox board (React, Tailwind, json-render) |
| `python/` | `folio_hook` for hook scripts, `folio_client` for Python workers |
| `templates/lectern` | The bundled pack: theme, layouts, fonts, the `line-plot` and `chem-subscripts` hooks |
| `decks/` | Decks: `deck.json`, `slides/<id>.json`, `comments/`, `.folio/` (state) |
| `e2e/` | Browser and CLI checks; `e2e/fixtures/decks` are the decks they copy, `e2e/workspace` the hook test workspace |
| `spec/` | Every feature as the user described it: demand, behaviour, rejected designs, status, checks |

## Checks

```sh
bash e2e/run-all.sh             # every check in parallel, each on its own workspace copy and free port
bash e2e/run-all.sh board chat  # only the checks named
node e2e/<name>.mjs             # one check alone; it serves its own copy of e2e/fixtures/decks
pnpm test                       # core unit tests
```
