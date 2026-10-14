# Installing folio

If `folio` is already on PATH, nothing here is needed. Otherwise, before
installing anything, tell the user what you are about to install and ask
them to confirm — do not install on your own say-so.

folio is on PyPI as `folio-deck`. The pip install bundles its own Node
through Playwright, so no separate Node install is needed; for plot hooks
you also need a Python 3.9 or later with matplotlib. The install itself
never downloads Chromium: the first folio command that needs a browser
(PDF, PPTX, a shot, a check) downloads it once, in the caller's terminal,
with Playwright's own progress bar. `FOLIO_NO_BROWSER_DOWNLOAD=1` refuses
that download instead and names the manual command.

## 1. One command, once the user agrees

```sh
pip install "folio-deck==0.1.3"                   # or a newer 0.1.x
folio                                             # opens the deck list; downloads Chromium on first use
```

To fetch Chromium ahead of time instead (optional, with the user's consent):
`python -m playwright install chromium`.

This puts `folio` on PATH; nothing persistent (no shell profile, no alias)
is needed. `folio` alone, in a terminal, opens the deck list of the
workspace you are in, or of the default workspace (`$FOLIO_HOME`, else
`~/Documents/folio`, else `~/folio-decks`, made on first use with the
`lectern` pack), starting the server in the background; `folio stop` stops
it. From a non-terminal shell it only prints the usage, so an agent uses the
explicit commands below.

Building folio from source is for contributing to folio itself, and is
described in the repository's README; this skill does not need it.

## 2. Python for hooks

Hooks (plot figures, text rewrites) run with `[runtimes] python` from
`folio.local.toml` beside `folio.toml`, else the first `python3`, `python` or
(Windows) `py -3` on PATH that is 3.9 or later. Figure hooks need matplotlib:

```sh
python3 -m pip install matplotlib                 # or a venv, then:
printf '[runtimes]\npython = "/path/to/venv/bin/python"\n' > folio.local.toml
```

`folio.local.toml` is machine-specific and stays out of git. A pack's hooks
run on this machine too: before running a pack you did not write, tell the
user its hooks run Python code, and run them only with their agreement.

## 3. A workspace

A workspace is any folder holding `folio.toml`; decks live in its `decks/`,
packs in its `templates/`. Use only a pack already in the workspace's
`templates/` or a local folder the user names — never `folio pack import` a
URL. For your own project, make a new one:

```sh
mkdir talks && cd talks
printf '[workspace]\ndecks = "decks"\ntemplates = "templates"\n' > folio.toml
folio pack import /path/to/a/local/pack           # install a pack already on disk into this workspace
folio init-deck decks/my-talk --template mypack@1 --title "My talk"
folio skill install                               # this skill, into .claude/skills/folio-deck/
```

Without `--template`, `init-deck` uses the built-in pack `plain@1`.

## 4. Check and serve

```sh
folio doctor            # Node, web build, Chromium, Python, matplotlib, workspace, port; each FAIL prints its fix
folio serve .           # the editor at http://localhost:4310 (tries 4310 to 4313)
```

Leave `folio serve` running in the background, only for the length of the
task; stop it with `folio stop` when done. Each deck opens at `/<deck id>/`;
`init-deck` prints it. On a remote machine the user forwards the port
(`ssh -L 4310:localhost:4310 host`, or VS Code Remote-SSH); `folio serve
--open` and `folio open <deck>` ask VS Code to forward and open it.

## Updating

```sh
pip install --upgrade "folio-deck==0.1.4"         # or whichever version the user names
folio restart
```

Then `folio skill install --force` refreshes this skill in each workspace.
