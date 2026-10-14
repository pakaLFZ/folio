# folio-deck

folio is an agent-first slide-deck framework: JSON slides in template packs,
a live browser editor, PDF and editable PowerPoint out. This package installs
the `folio` command and the two Python helpers hooks and scripts use,
`folio_hook` and `folio_client`.

```sh
pip install folio-deck
python -m playwright install chromium
folio
```

`folio` opens the deck list of the current workspace, or of the default one
(`$FOLIO_HOME`, else `~/Documents/folio`, else `~/folio-decks`), starting the
server in the background. See https://github.com/pakaLFZ/folio for the full
guide, or run `folio doctor` for a one-line-per-check diagnosis.

`folio_hook` and `folio_client` are separate importable packages, for a
hook's own script (`from folio_hook import run, save_figure`) and for driving
a deck over its HTTP API (`from folio_client import Deck`). The `plots` extra
(`pip install "folio-deck[plots]"`) adds matplotlib, which figure hooks need.
