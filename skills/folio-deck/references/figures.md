# Figures, tables and hooks

## Three ways to fill a figure slot

1. **A pack hook** (preferred when one fits). The slide gives only the
   inputs; folio draws the figure at the slot's exact size, caches it, and
   redraws it when the box changes. A hook from a pack you did not write
   runs Python on this machine: tell the user first, run it only with their
   agreement.
   ```json
   "fig:a": {"hook": "line-plot", "inputs": {"x_label": "Load / kN", "y_label": "Extension / mm",
             "series": [{"name": "Reference", "x": [0, 1, 2], "y": [0, 0.3, 0.6]}]}}
   ```
   `folio hook list` names the pack's hooks; `folio hook show <pack>/<hook>`
   prints the inputs schema and an example. Inputs that do not match the
   schema are refused with the allowed names.
2. **Your own script, traced.** Draw at the slot's size and record how the
   picture was made, so `folio check` can say when it is stale and `folio
   trace` can make it again:
   ```python
   import matplotlib.pyplot as plt
   from folio_hook import slot_size, save_traced
   size = slot_size("decks/talk", "s004", "fig:a")
   fig = plt.figure(figsize=size.figsize)
   # ... plot ...
   save_traced(fig, "decks/talk/fig/energy.png", script=__file__, inputs=["data.csv"])
   ```
   Run it with `folio py script.py` (your own script, never a third-party
   one, with the workspace's Python and `folio_hook` importable), then put
   `"fig/energy.png"` in the slot. `folio box <deck>/<slide> <slot>` prints
   the same size in pt and inches.
3. **A plain picture.** Copy it into `decks/<deck>/fig/` and write the
   relative path. It works, with the note FOLIO-FIG-002 (untraced). A path
   outside the deck is FOLIO-FIG-005.

Debug a hook figure with `folio run-hook <deck>/<slide>/<slot>` (full
output, foreground); `folio queue` shows hook jobs and `folio queue resume
<hook>` re-arms a paused one. `folio hook run <pack>/<hook> --inputs F --size
W,H --out FILE` draws one without a deck.

## Tables

A table slot takes `{"columns": [...], "rows": [[...], ...]}`, one string per
cell, or `{"src": "values.table.json"}` (a file in the deck, redrawn when it
changes). The pack's table style draws it; a slot placed `below` a table
moves with the table's height. Numbers typed by hand are noted (FOLIO-TAB-002);
`folio_hook.write_table` writes a traced table file.

## Writing a hook

A hook lives in its pack: `templates/<pack>/hooks/<name>/hook.json` and a
script. One mechanism serves figure, text and table slots.

```json
{"name": "bar-chart", "version": 1, "output": "figure",
 "description": "Bars of up to eight values.",
 "runtime": "python", "command": ["draw.py"], "entry": "draw:draw",
 "mode": "spawn", "outputs": "png", "dpi": 200, "timeout": 60,
 "requires": ["matplotlib>=3.8"],
 "inputs": {"type": "object", "required": ["values"], "properties": {"values": {"type": "array"}}},
 "example": {"values": [1, 2, 3]}}
```

- `output`: `figure` (default), `text` or `table`. `inputs` is a JSON Schema
  (required for figures). `mode`: `spawn` (a process per job) or `warm`
  (long-lived workers, much faster for matplotlib). Never put an interpreter
  path in a pack; `runtime` is a name mapped in `folio.local.toml`.
- The script:
  ```python
  from folio_hook import run, save_figure, warn, fail
  import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt

  def draw(request):
      fig, ax = plt.subplots(figsize=request.size_inches)
      ax.bar(range(len(request.inputs["values"])), request.inputs["values"])
      save_figure(fig, request)          # exactly the box size

  run(draw)
  ```
  A text hook returns the new text (`request.text`), a table hook returns
  `{"columns", "rows"}` (`request.table`). `warn(msg, field=...)` adds a
  warning; `fail(msg)` refuses with a message.
- A layout slot names the hook with `"hook": "<name>"`; a text or table hook
  then runs on whatever the slot receives. `folio pack check` refuses a hook
  whose `output` does not match its slot's kind.
- Change `version` when the drawing changes, so cached figures are redrawn.
