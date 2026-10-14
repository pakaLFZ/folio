import { useEffect, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Toolbar } from 'radix-ui';
import { Bold, Italic, Underline, Strikethrough, Superscript, Subscript, Eraser, List, ListOrdered } from 'lucide-react';
import { cssColor, type Pack, type Run } from '@folio/core';
import { domToMarkup, selectedOffsets, styleSelection } from './markupDom';
import { currentSelectionStyle, type SelectionStyle } from './characterFormatting';
import { listSelectionKind, toggleList } from './listEditing';

interface Place { x: number; y: number; above: boolean; range: Range; style: SelectionStyle }
type Field = keyof Pick<Run, 'bold' | 'italic' | 'underline' | 'strike' | 'script' | 'size' | 'color' | 'highlight' | 'font'>;

function placeOf(root: HTMLElement, size: number, color?: string, font?: string): Place | null {
  if (!selectedOffsets(root)) return null;
  const sel = getSelection();
  if (!sel?.rangeCount) return null;
  const range = sel.getRangeAt(0).cloneRange();
  const rect = range.getBoundingClientRect();
  const margin = Math.min(innerWidth / 2, 360);
  return { x: Math.max(margin, Math.min(innerWidth - margin, rect.left + rect.width / 2)), y: rect.top > 88 ? rect.top - 8 : rect.bottom + 8, above: rect.top > 88, range, style: currentSelectionStyle(root, size, color, font)! };
}

const iconClass = 'size-[28px] rounded-control flex items-center justify-center hover:bg-whisper focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus';
const controlClass = 'h-[28px] rounded-control border border-line bg-transparent px-1 text-[11px]';

function runChange(field: Field | 'clear', value: string | number | boolean | undefined, current: SelectionStyle): Partial<Run> {
  if (field === 'clear') return { bold: false, italic: false, underline: false, strike: false, script: 'none', size: undefined, color: undefined, font: undefined, highlight: undefined };
  if (field === 'script') return { script: current[value as 'sub' | 'sup'] ? 'none' : value as Run['script'] };
  if (typeof value === 'boolean') return { [field]: !current[field as 'bold'] };
  return { [field]: value };
}

function Controls({ pack, style, apply, listKind, onList }: { pack: Pack; style: SelectionStyle; apply: (field: Field | 'clear', value?: string | number | boolean) => void; listKind: string | null; onList?: (kind: 'bullet' | 'number') => void }) {
  const colors = Object.keys(pack.colors);
  const fonts = [...new Set(pack.fonts.map((f) => f.family))];
  const button = (name: string, icon: React.ReactNode, action: () => void, pressed?: boolean) => <Toolbar.Button className={iconClass} title={name} aria-label={name} aria-pressed={pressed} data-pressed={pressed || undefined} onMouseDown={(e) => e.preventDefault()} onClick={action}>{icon}</Toolbar.Button>;
  const colorSelect = (name: string, field: 'color' | 'highlight') => <label className='flex items-center gap-1 text-[11px]'>{name}<span aria-label={`${name} swatch`} className='size-[14px] border border-line' style={{ backgroundColor: style[field] ? cssColor(style[field], pack.colors, '#000000') : 'transparent' }} /><select aria-label={name} className={controlClass} value={style[field] && colors.includes(style[field]) ? style[field] : ''} onChange={(e) => apply(field, e.target.value)}><option value=''>Pick</option>{colors.map((key) => <option key={key} value={key}>{key}</option>)}</select><input aria-label={'Custom ' + name.toLowerCase()} title={'Custom ' + name.toLowerCase()} type='color' value={style[field]?.startsWith('#') ? style[field] : '#000000'} className='h-[26px] w-[24px] cursor-pointer' onChange={(e) => apply(field, e.target.value)} /></label>;
  return <>
    <label className='flex items-center gap-1 text-[11px]'>Size<input aria-label='Font size' type='number' min='1' max='400' step='0.5' value={style.size ?? ''} className={controlClass + ' w-[49px]'} onChange={(e) => Number(e.target.value) > 0 && apply('size', Number(e.target.value))} /></label>
    {button('Smaller', <span className='text-[12px]'>A−</span>, () => apply('size', Math.max(1, (style.size ?? 1) - 1)))}
    {button('Larger', <span className='text-[12px]'>A+</span>, () => apply('size', (style.size ?? 1) + 1))}
    {colorSelect('Colour', 'color')}
    {button('Bold', <Bold size={14} />, () => apply('bold', true), style.bold)}
    {button('Italic', <Italic size={14} />, () => apply('italic', true), style.italic)}
    {button('Underline', <Underline size={14} />, () => apply('underline', true), style.underline)}
    {button('Strikethrough', <Strikethrough size={14} />, () => apply('strike', true), style.strike)}
    {button('Subscript', <Subscript size={14} />, () => apply('script', 'sub'), style.sub)}
    {button('Superscript', <Superscript size={14} />, () => apply('script', 'sup'), style.sup)}
    <select aria-label='Font family' className={controlClass} value={style.font ?? ''} onChange={(e) => apply('font', e.target.value)}><option value=''>Font</option>{fonts.map((name) => <option key={name} value={name}>{name}</option>)}</select>
    {colorSelect('Highlight', 'highlight')}
    {button('Clear formatting', <Eraser size={14} />, () => apply('clear'))}
    {onList && button('Bullets', <List size={14} />, () => onList('bullet'), listKind === 'bullet')}
    {onList && button('Numbering', <ListOrdered size={14} />, () => onList('number'), listKind === 'number')}
  </>;
}

/** A toolbar for a range in one slot; buttons restore the saved range before changing it. */
export function RichTextToolbar({ root, pack, size, color, font, allowLists, onChange, onDone }: { root: RefObject<HTMLDivElement | null>; pack: Pack; size: number; color?: string; font?: string; allowLists?: boolean; onChange: (value: string) => void; onDone?: () => void }) {
  const [place, setPlace] = useState<Place | null>(null);
  useEffect(() => {
    const update = () => {
      if (document.activeElement?.closest('[data-rich-text-toolbar]')) return;
      setPlace(root.current ? placeOf(root.current, size, color, font) : null);
    };
    document.addEventListener('selectionchange', update);
    document.addEventListener('mouseup', update);
    document.addEventListener('keyup', update);
    return () => { document.removeEventListener('selectionchange', update); document.removeEventListener('mouseup', update); document.removeEventListener('keyup', update); };
  }, [root, size, color, font]);
  const apply = (field: Field | 'clear', value?: string | number | boolean) => {
    const el = root.current;
    if (!el || !place) return;
    const sel = getSelection();
    sel?.removeAllRanges();
    sel?.addRange(place.range);
    if (styleSelection(el, runChange(field, value, currentSelectionStyle(el, size, color, font)!), pack.colors)) onChange(domToMarkup(el));
    setPlace(placeOf(el, size, color, font));
  };
  const onList = (kind: 'bullet' | 'number') => {
    const el = root.current;
    if (!el || !place) return;
    const sel = getSelection();
    sel?.removeAllRanges();
    sel?.addRange(place.range);
    if (toggleList(el, kind)) onChange(domToMarkup(el));
    setPlace(placeOf(el, size, color, font));
  };
  if (!place) return null;
  return createPortal(
    <Toolbar.Root data-rich-text-toolbar='' aria-label='Character formatting' className='fixed z-[100] flex max-w-[min(96vw,720px)] flex-wrap items-center gap-1 rounded-control border border-line bg-raised p-[5px] font-sans text-[13px] text-ink shadow-[var(--sheet-lift)]' style={{ left: place.x, top: place.y, transform: `translate(-50%, ${place.above ? '-100%' : '0'})` }} onBlurCapture={(e) => { if (!(e.relatedTarget instanceof HTMLElement && e.relatedTarget.closest('[data-rich-text-toolbar]'))) onDone?.(); }} onMouseDown={(e) => { if (!(e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement)) e.preventDefault(); }}>
      <Controls pack={pack} style={place.style} apply={apply} listKind={allowLists && root.current ? listSelectionKind(root.current) : null} onList={allowLists ? onList : undefined} />
    </Toolbar.Root>, document.body,
  );
}
