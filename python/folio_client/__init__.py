"""folio_client: build folio decks from Python, through the same HTTP API the
browser and the CLI use.

    from folio_client import Deck

    deck = Deck.open("http://localhost:4310", "example")
    slide = deck.new_slide("note-figure", {"title": "ABSTRACT"}, worker="py1")
    slide.set("caption", "Both paths open at room temperature")   # raises RevisionConflict on a stale rev
    print(deck.warnings())
"""
from .client import Deck, FolioError, RevisionConflict, Slide, viewing

__all__ = ["Deck", "FolioError", "RevisionConflict", "Slide", "viewing"]
