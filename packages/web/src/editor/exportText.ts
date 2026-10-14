/** What the notice says once the PDF, PowerPoint or folio deck is downloaded. */
export function savedText(r: { file: string; warnings: number; stale: string[]; approximations?: number }): string {
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const extras = [
    r.warnings ? plural(r.warnings, "warning") : "",
    r.stale.length ? `${plural(r.stale.length, "figure")} still drawing` : "",
    r.approximations ? `${plural(r.approximations, "object")} drawn as pictures` : "",
  ].filter(Boolean);
  return `Saved ${r.file}${extras.length ? `, ${extras.join(", ")}` : ""}`;
}
