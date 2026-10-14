/**
 * A table slot: a real HTML table at the slot's x, y and width, drawn in one of
 * the pack's named table styles, as tall as its rows. The box height is only a
 * maximum: a taller table, or a cell that wraps, is measured and warned about,
 * never shrunk. Rules are drawn as inset shadows and an outline, so they never
 * add to the height the rows give. A slot whose layout names a table hook draws
 * the hook's rows made from its content, and its raw rows while the hook runs
 * or after it fails; the measurement is of what is drawn.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { columnAlign, fontFamilyOf, hookedTableOf, placeholderOf, readTableFile, tableDataSchema, tableStyleOf, type Box, type RefinedSlot, type Slot, type TableData, type TableStyle, type WrappedCell } from "@folio/core";
import { useSlideEnv, type FigureState } from "./env";
import { HookBadge } from "./FigureSlot";
import { markupToHtml } from "./markupDom";
import { PX_PER_PT } from "./measure";

type Loaded = { data: TableData | null; error: string | null; loading: boolean };

/**
 * Render a table slot.
 *
 * @param props.value - `{columns, rows}`, `{src}`, either with `tableStyle`, or null.
 * @param props.box - the box as laid out (its height is the table's maximum).
 * @param props.ink - the background's ink, for cells the style gives no ink.
 * @param props.onReach - told the table's height when another slot sits below it.
 */
export function TableSlot({ name, slot, box, value, ink, onReach }: { name: string; slot: RefinedSlot; box: Box; value: unknown; ink: string; onReach?: (pt: number) => void }) {
  const env = useSlideEnv();
  const tableRef = useRef<HTMLTableElement>(null);
  const [x, y, w, h] = box;
  const { name: styleName, style } = tableStyleOf(env.pack, slot, value);
  const raw = useTableData(value, env.fileUrl);
  const hooked = slot.hook && value ? env.figure(name, { hook: slot.hook, input: value }) : null;
  const derived = hooked ? hookedTableOf(value, hooked.output, !!hooked.current) : null;
  const { data, error, loading } = derived ? { data: derived, error: null, loading: false } : raw;
  const [over, setOver] = useState(false);
  useLayoutEffect(() => {
    const table = tableRef.current;
    const measured = table && data ? measureTable(table, style, data.rows.length) : null;
    onReach?.(measured?.heightPt ?? 0);
    if (loading) return;
    env.onSlotMeasured?.({ slot: name, lines: 0, overPt: 0, ...(slot.below ? { boxPt: h } : {}), ...(measured ? { table: measured } : {}) });
    setOver(!!measured && (measured.heightPt > h + 0.5 || measured.wrapped.length > 0));
  });
  const chrome = env.mode === "edit";
  const danger = over || (!!error && chrome);
  const outline = chrome && (danger || env.selectedSlot === name) ? `1px solid ${danger ? "var(--color-danger)" : "rgb(0 0 0 / 0.35)"}` : undefined;
  return (
    <div className="folio-slot" data-slot={name} data-table-style={styleName} data-overflow={over ? "table" : undefined} data-folio-loading={loading ? "" : undefined} onClick={() => chrome && env.onSelectSlot?.(name)} style={{ left: `${x}pt`, top: `${y}pt`, width: `${w}pt`, height: `${Math.max(0, h)}pt`, justifyContent: "flex-start", outline, outlineOffset: -1 }}>
      {data ? (
        <Table tableRef={tableRef} data={data} style={style} ink={ink} family={fontFamilyOf(env.pack, style)} />
      ) : chrome || env.mode === "thumb" ? (
        <EmptyTable name={name} slot={slot} style={style} message={error} />
      ) : null}
      {hooked && chrome ? <HookBadge figure={derived || hooked.state !== "ok" ? hooked : ({ ...hooked, state: "drawing" } satisfies FigureState)} /> : null}
    </div>
  );
}

/** The table element itself: header row, then body rows, every cell one line of markup. */
function Table({ tableRef, data, style, ink, family }: { tableRef: RefObject<HTMLTableElement | null>; data: TableData; style: TableStyle; ink: string; family: string }) {
  const pitch = style.size * style.lineHeight;
  const rule = style.rule.width > 0 ? style.rule : null;
  const cell = (row: number, col: number, header: boolean): CSSProperties => {
    const lastRow = row === data.rows.length - 1;
    const shadows = [rule && rule.columns && col < data.columns.length - 1 ? `inset -${rule.width}pt 0 0 ${rule.color}` : "", rule && rule.rows && !lastRow ? `inset 0 -${rule.width}pt 0 ${rule.color}` : ""].filter(Boolean);
    const band = !header && row % 2 === 0 && style.bandFill ? style.bandFill : null;
    return {
      padding: style.cellPad.map((p) => `${p}pt`).join(" "),
      textAlign: columnAlign(style, col),
      verticalAlign: "top",
      fontWeight: header ? style.headerWeight : 400,
      background: (header ? style.headerFill : (band ?? style.fill)) ?? "transparent",
      color: (header ? (style.headerInk ?? style.ink) : style.ink) ?? ink,
      boxShadow: shadows.length ? shadows.join(", ") : undefined,
    };
  };
  const text = (s: string) => <div className="folio-text folio-cell" style={{ lineHeight: `${pitch}pt` }} dangerouslySetInnerHTML={{ __html: markupToHtml(s) }} />;
  return (
    <table ref={tableRef} style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontFamily: family, fontSize: `${style.size}pt`, lineHeight: `${pitch}pt`, outline: rule?.outer ? `${rule.width}pt solid ${rule.color}` : undefined, outlineOffset: rule?.outer ? `-${rule.width}pt` : undefined, flex: "none" }}>
      {style.header ? (
        <thead>
          <tr>{data.columns.map((c, i) => <th key={i} scope="col" style={cell(-1, i, true)}>{text(c)}</th>)}</tr>
        </thead>
      ) : null}
      <tbody>
        {data.rows.map((row, r) => (
          <tr key={r}>{row.map((c, i) => <td key={i} style={cell(r, i, false)}>{text(c)}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Measure a rendered table.
 *
 * @returns its height in pt, its body row count, and every cell whose text took
 *   more than one line (header cells as `header, column N`).
 */
function measureTable(table: HTMLTableElement, style: TableStyle, rows: number): { heightPt: number; rows: number; wrapped: WrappedCell[] } {
  const pitch = style.size * style.lineHeight;
  const wrapped: WrappedCell[] = [];
  table.querySelectorAll("tr").forEach((tr, r) => {
    tr.querySelectorAll<HTMLElement>(".folio-cell").forEach((el, c) => {
      const lines = Math.round(el.offsetHeight / PX_PER_PT / pitch);
      const row = style.header ? r : r + 1;
      if (lines > 1) wrapped.push({ cell: row === 0 ? `header, column ${c + 1}` : `row ${row}, column ${c + 1}`, lines });
    });
  });
  return { heightPt: Math.round((table.offsetHeight / PX_PER_PT) * 10) / 10, rows, wrapped };
}

/**
 * The rows of a table value: inline, or fetched from its `.table.json` file.
 *
 * @returns the rows once known, an error naming what is wrong, and whether a file is still loading.
 */
function useTableData(value: unknown, fileUrl: ((path: string) => string) | undefined): Loaded {
  const inline = value && typeof value === "object" && "columns" in value ? tableDataSchema.safeParse({ columns: (value as TableData).columns, rows: (value as TableData).rows }) : null;
  const src = value && typeof value === "object" && "src" in value && typeof (value as { src: unknown }).src === "string" ? (value as { src: string }).src : null;
  const [file, setFile] = useState<Loaded & { src: string | null }>({ data: null, error: null, loading: false, src: null });
  const url = src && fileUrl ? fileUrl(src) : null;
  useEffect(() => {
    if (!src || !url) return;
    let live = true;
    setFile((prev) => (prev.src === src && prev.data ? prev : { data: null, error: null, loading: true, src }));
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${src} is missing`))))
      .then((json) => {
        const read = readTableFile(json);
        if (live) setFile({ data: read.ok ? read.table : null, error: read.ok ? null : `${src}: ${read.reason}`, loading: false, src });
      })
      .catch((e: Error) => live && setFile({ data: null, error: e.message, loading: false, src }));
    return () => void (live = false);
  }, [src, url]);
  if (inline) return { data: inline.success ? inline.data : null, error: inline.success ? null : (inline.error.issues[0]?.message ?? "bad table"), loading: false };
  if (src && fileUrl) return file.src === src ? file : { data: null, error: null, loading: true };
  return { data: null, error: src ? "no deck to read the table file from" : null, loading: false };
}

/** An empty or unreadable table in the editor: one row's height, dashed, with the placeholder or the problem. */
function EmptyTable({ name, slot, style, message }: { name: string; slot: RefinedSlot; style: TableStyle; message: string | null }) {
  const pitch = style.size * style.lineHeight;
  return (
    <div data-placeholder={placeholderOf(name, slot)} style={{ height: `${pitch + style.cellPad[0] + style.cellPad[2]}pt`, boxSizing: "border-box", border: "1px dashed color-mix(in srgb, currentColor 22%, transparent)", display: "flex", alignItems: "center", padding: `0 ${style.cellPad[3]}pt`, overflow: "hidden", pointerEvents: "none", userSelect: "none", fontSize: `${style.size}pt`, whiteSpace: "nowrap", opacity: message ? 1 : 0.4, color: message ? "var(--color-danger)" : undefined }}>
      {message ?? placeholderOf(name, slot)}
    </div>
  );
}
