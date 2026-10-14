/**
 * Typing that arrives before its box can take it. A text box or block drawn
 * on the slide exists only once its write returns, so the keys pressed
 * between the release and its caret are held here, kept from every other
 * key handler (on the window's capture phase, ahead of the tool keys, which
 * would otherwise take a typed "t" or "o"), and replayed
 * into the box when it takes focus.
 */

/** Holds keys from now until `release`. */
export interface HeldTyping {
  /** Stop holding; focus the element and type what was held into it, or drop it when there is none. */
  release: (target: HTMLElement | null) => void;
}

/** Start holding the keys typed on the page. */
export function holdTyping(): HeldTyping {
  let text = "";
  const hold = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    if (e.key.length === 1) text += e.key;
    else if (e.key === "Enter") text += "\n";
    else if (e.key === "Backspace") text = text.slice(0, -1);
    else return;
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  window.addEventListener("keydown", hold, true);
  return {
    release(target) {
      window.removeEventListener("keydown", hold, true);
      if (!target) return;
      target.focus();
      if (!text) return;
      getSelection()?.selectAllChildren(target);
      getSelection()?.collapseToEnd();
      document.execCommand("insertText", false, text);
    },
  };
}
