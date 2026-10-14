# Installing folio

folio is not on npm (its name there is taken), but is on PyPI as
`folio-deck`. Either way you need Node 20 or later (pip installs bundle their
own, through Playwright) or a Node on PATH, and for plot hooks a Python 3.9
or later with matplotlib.

## 1a. One command (quickest)

With pip:

```sh
pip install folio-deck
folio                                             # opens the deck list in the browser
```

Or with npm, if you already have Node 20+ on PATH:

```sh
npm install -g https://github.com/pakaLFZ/folio/releases/latest/download/folio.tgz
folio                                             # opens the deck list in the browser
```

Neither install downloads Chromium: the first run does, once, printing
Playwright's own progress bar (`FOLIO_NO_BROWSER_DOWNLOAD=1` refuses instead
and names the manual command). To do it ahead of time:
`python -m playwright install chromium` (pip) or
`npx playwright install chromium` (npm) — Linux: add `--with-deps` if system
libraries are missing.

Either way `folio` is then on PATH; skip step 2. `folio` alone, in a
terminal, opens the deck list of the workspace you are in, or of the
default workspace (`$FOLIO_HOME`, else `~/Documents/folio`, else
`~/folio-decks`, made on first use with the `lectern` pack), starting the
server in the background; `folio stop` stops it. From a non-terminal shell
it only prints the usage, so an agent uses the explicit commands below.
Step 1b is only for working on folio itself.

## 1b. Clone and build from source

```sh
git clone https://github.com/pakaLFZ/folio.git ~/folio
cd ~/folio
corepack enable                                   # or: npm install -g pnpm@10
pnpm install
pnpm build:web                                    # folio downloads Chromium on first use; to do it ahead: pnpm exec playwright install chromium (Linux: --with-deps)
```

On Windows use PowerShell and a path such as `$HOME\folio`; the commands are
the same.

## 2. A `folio` command

The CLI is `node <clone>/packages/cli/bin/folio.mjs`. Make it `folio`:

- macOS and Linux: add `alias folio="node $HOME/folio/packages/cli/bin/folio.mjs"`
  to `~/.bashrc` or `~/.zshrc`, or write a two-line script on PATH:
  `#!/bin/sh` and `exec node "$HOME/folio/packages/cli/bin/folio.mjs" "$@"`.
- Windows PowerShell: add
  `function folio { node "$HOME\folio\packages\cli\bin\folio.mjs" @args }` to
  `$PROFILE`.

In a non-interactive shell where aliases do not load, call the `node ...`
line directly.

## 3. Python for hooks

Hooks (plot figures, text rewrites) run with `[runtimes] python` from
`folio.local.toml` beside `folio.toml`, else the first `python3`, `python` or
(Windows) `py -3` on PATH that is 3.9 or later. Figure hooks need matplotlib:

```sh
python3 -m pip install matplotlib                 # or a venv, then:
printf '[runtimes]\npython = "/path/to/venv/bin/python"\n' > folio.local.toml
```

`folio.local.toml` is machine-specific and stays out of git.

## 4. A workspace

A workspace is any folder holding `folio.toml`; decks live in its `decks/`,
packs in its `templates/`. The clone itself is one, with the example pack
`templates/lectern`. For your own project, make a new one:

```sh
mkdir talks && cd talks
printf '[workspace]\ndecks = "decks"\ntemplates = "templates"\n' > folio.toml
folio pack import ~/folio/templates/lectern       # install a pack into this workspace
folio init-deck decks/my-talk --template lectern@1 --title "My talk"
folio skill install                               # this skill, into .claude/skills/folio-deck/
```

Without `--template`, `init-deck` uses the built-in pack `plain@1`.

## 5. Check and serve

```sh
folio doctor            # Node, web build, Chromium (downloads it if missing), Python, matplotlib, workspace, port; each FAIL prints its fix
folio serve .           # the editor at http://localhost:4310 (tries 4310 to 4313)
```

Leave `folio serve` running in the background. Each deck opens at
`/<deck id>/`; `init-deck` prints it. On a remote machine the user forwards
the port (`ssh -L 4310:localhost:4310 host`, or VS Code Remote-SSH);
`folio serve --open` and `folio open <deck>` ask VS Code to forward and open
it. After pulling a new folio version: `pnpm install && pnpm build:web`, then
`folio restart`.

## Updating

Installed with npm: run the same `npm install -g ...folio.tgz` again, then
`folio restart`. A clone:

```sh
cd ~/folio && git pull && pnpm install && pnpm build:web && folio restart
```

Then `folio skill install --force` refreshes this skill in each workspace.
