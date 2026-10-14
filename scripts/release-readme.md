# folio {version}

An agent-first slide framework: JSON slides in template packs, a live browser
editor, PDF and editable PPTX out. This is the minimal release: the CLI and
server in one JavaScript file, the editor as built assets, the `plain` and
`lectern` packs, the Python hook helpers and the agent skill. The sources,
tests and specs are in the repository, https://github.com/pakaLFZ/folio.

## Install

Node 20 or later, and for plot hooks Python 3.9 or later with matplotlib.

```sh
cd folio-{version}
npm install                              # Playwright, the only dependency
npx playwright install chromium          # Linux: add --with-deps if libraries are missing
node packages/cli/bin/folio.mjs doctor
```

Make it a command: `npm install -g .` here (or install the release's `.tgz`
straight from its URL with `npm install -g <url>`). Then `folio` alone opens
the deck list in your browser.

## Use

```sh
folio init-deck decks/talk --template lectern@1 --title "My talk"
folio serve .                            # the editor at http://localhost:4310
folio quickstart                         # a worked example, empty deck to pptx
folio skill install                      # the agent skill, into .claude/skills/folio/
```

This folder is a workspace (`folio.toml`). For another one, make a folder with
a `folio.toml` holding `[workspace]` `decks = "decks"` `templates =
"templates"`, then `folio pack import <this folder>/templates/lectern`.

Agents: everything an agent needs is in `skills/folio/SKILL.md`.
