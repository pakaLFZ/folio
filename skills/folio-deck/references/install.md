# Installing folio

If `folio` is already on PATH, nothing here is needed. Otherwise, before
installing anything, tell the user what you are about to install and ask
them to confirm — do not install on your own say-so.

folio is not on npm (its name there is taken), but is on PyPI as
`folio-deck`. Either way you need Node 20 or later (pip installs bundle their
own, through Playwright) or a Node on PATH, and for plot hooks a Python 3.9
or later with matplotlib. Chromium (for PDF, PPTX and screenshot output) is
downloaded by Playwright, either by folio itself the first time one of those
runs, or ahead of time with the command below.

## 1a. One command (quickest), once the user agrees

Prefer pip, a registry package, pinned to a version for reproducibility:

```sh
pip install "folio-deck==0.1.3"                   # or a newer 0.1.x
python -m playwright install chromium             # Linux: add --with-deps if libraries are missing
folio                                             # opens the deck list in the browser
```

Or with npm, if you already have Node 20+ on PATH, from a pinned release
asset — never `.../releases/latest/...`, which moves:

```sh
npm install -g https://github.com/pakaLFZ/folio/releases/download/v0.1.3/folio-0.1.3.tgz
npx playwright install chromium                   # Linux: add --with-deps if libraries are missing
folio                                             # opens the deck list in the browser
```

Check the asset exists before running the npm line:
`gh release view v0.1.3 -R pakaLFZ/folio`.

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
pnpm exec playwright install chromium             # Linux: add --with-deps if system libraries are missing
pnpm build:web
```

On Windows use PowerShell and a path such as `$HOME\folio`; the commands are
the same.

## 2. A `folio` command

The CLI is `node <clone>/packages/cli/bin/folio.mjs`. This never needs
editing a shell startup file on its own: either tell the user the line to
add, or run it yourself only once they have agreed.

- macOS and Linux: a two-line script on PATH —
  `#!/bin/sh` and `exec node "$HOME/folio/packages/cli/bin/folio.mjs" "$@"` —
  needs no startup-file edit. The alternative, if the user wants it, is
  `alias folio="node $HOME/folio/packages/cli/bin/folio.mjs"` added to
  `~/.bashrc` or `~/.zshrc`; tell them the line, or add it yourself only
  with their agreement.
- Windows PowerShell: the equivalent line for `$PROFILE` is
  `function folio { node "$HOME\folio\packages\cli\bin\folio.mjs" @args }`;
  same rule — tell the user, or edit it only with their agreement.

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
folio doctor            # Node, web build, Chromium, Python, matplotlib, workspace, port; each FAIL prints its fix
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
