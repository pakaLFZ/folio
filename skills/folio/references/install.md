# Installing folio

folio is not on npm. You need Node 20 or later, and for plot hooks a
Python 3.9 or later with matplotlib.

## 1a. The release (quickest)

```sh
curl -LO https://github.com/pakaLFZ/folio/releases/latest/download/folio.zip
unzip folio.zip && cd folio-*/
npm install                                       # Playwright, the only dependency
npx playwright install chromium                   # Linux: add --with-deps if libraries are missing
```

The CLI is then `node <that folder>/packages/cli/bin/folio.mjs`; go on at
step 2 with that path in place of `~/folio`. Step 1b is only for working on
folio itself.

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
folio skill install                               # this skill, into .claude/skills/folio/
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

A release: download and unpack the new one, `npm install`, then `folio
restart`. A clone:

```sh
cd ~/folio && git pull && pnpm install && pnpm build:web && folio restart
```

Then `folio skill install --force` refreshes this skill in each workspace.
