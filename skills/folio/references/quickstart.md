# folio quickstart: from nothing to a pptx

Run every command from the workspace root, the folder holding folio.toml.
The example uses the pack lectern@1; with another pack, take the layout and
slot names from `folio layouts`. Pick one worker name (here `me`) and put
`--worker me` on every write. On PowerShell, put each JSON below in a file
and pass `--props p.json` instead of `--props -` and the heredoc.

1. folio doctor
   One line per check (Node, web build, Chromium, Python and matplotlib,
   workspace, port); run the fix printed under each FAIL. Hooks run with
   [runtimes] python in folio.local.toml beside folio.toml, e.g.
     [runtimes]
     python = "C:/Users/me/miniconda3/python.exe"
   else with python3 or python on PATH (3.9 or later; matplotlib for figure
   hooks). With neither, text shows as written and folio shot reports
   FOLIO-HOOK-006 on each slot.

2. folio init-deck decks/talk --template lectern@1 --title "My talk"
   Makes the deck on a pack found in the workspace's templates/ folder.

3. folio watch --deck decks/talk --for comments,answers
   Keep it running in the background (the Monitor tool) before any write:
   one line per comment or answer from the user; re-arm with --since <time>.

4. folio layouts decks/talk
   Every layout with its slots and boxes; `folio prompt decks/talk` says when
   to use each and how to fill it.

5. folio new decks/talk --template title --worker me --props - <<'EOF'
   {"title": "CO2 in the pore", "author": "A. Person"}
   EOF
   One call makes a whole slide; an unknown slot refuses the write.

6. mkdir decks/talk/fig; cp ~/results/energy.png decks/talk/fig/
   A figure is a path relative to the deck: copy outside pictures into fig/.
   A path outside the deck is reported as FOLIO-FIG-005.

7. folio new decks/talk --template note-figure --worker me --props - <<'EOF'
   {"title": "CO2 binds at one site", "subtitle": "Most CO2 sits at site A",
    "note": "The guest was relaxed in each pore.",
    "label:a": "(a) Binding energy per site", "fig:a": "fig/energy.png"}
   EOF
   Draw pictures at the slot's size: folio box decks/talk/s002 fig:a. A plain
   PNG gets only the note FOLIO-FIG-002 (untraced).

8. folio new decks/talk --template plot-table --worker me --props - <<'EOF'
   {"title": "Barriers", "label:a": "(a) Barrier against count",
    "fig:a": "fig/barrier.png", "table-label:b": "(b) Barrier of each band",
    "table:b": {"columns": ["Case", "E (eV)"],
                "rows": [["A", "0.12"], ["B", "0.30"]]},
    "note": "Shorter hops cost less."}
   EOF
   One string per cell; or {"src": "barrier.table.json"} for a file.

9. folio shot decks/talk --sheet
   One PNG per slide and a contact sheet in decks/talk/.shots/: look at them.

10. folio check decks/talk
   Every warning; text never shrinks, so shorten what overflows.

11. folio pptx decks/talk --out talk.pptx
   Master, backgrounds, text, pictures, tables and shapes stay editable; code
   blocks become pictures, each printed as a `picture:` line.

Later edits: folio patch decks/talk/s002 p.json --worker me, with p.json
[{"op": "replace", "path": "/elements/s/props/note", "value": "..."}].
