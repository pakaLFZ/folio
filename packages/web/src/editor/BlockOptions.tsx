/**
 * The block controls in the Text tool's popover: a Style picker listing the
 * pack's block styles beside the plain text box, and for a code style its
 * language. A block's look is its style's; the style names it once in the
 * pack, so nothing else is set here (spec/slides/blocks.md, "Editor").
 */
import { CODE_LANGUAGES, refinedBlockStyle, type CodeLanguage, type Pack } from "@folio/core";
import { Select } from "../ui/select";
import { Row } from "./ShapeOptions";

/** The pack's block styles as picker options, each with its kind. */
function styleOptions(pack: Pack) {
  return Object.entries(pack.blocks).map(([name, style]) => ({ value: name, label: `${name[0]!.toUpperCase()}${name.slice(1)}${style.kind === "code" ? " (code)" : ""}` }));
}

/**
 * The Style row, and the Language row for a code style.
 *
 * @param props.style - the block style, or "" for a plain text box (only when `plain` names that choice).
 * @param props.plain - the label of the no-block choice, or undefined when a block cannot stop being one.
 * @param props.language - the code language, or undefined for the style's own.
 */
export function BlockOptions({ pack, style, language, plain, onStyle, onLanguage }: { pack: Pack; style: string; language?: CodeLanguage; plain?: string; onStyle: (style: string) => void; onLanguage: (language: CodeLanguage) => void }) {
  const resolved = style ? refinedBlockStyle(pack, { style }).style : null;
  if (!Object.keys(pack.blocks).length) return null;
  return (
    <div className="space-y-1.5" data-block-options="">
      <Row label="Style">
        <Select label="Block style" all={plain ?? "Default"} value={style} options={styleOptions(pack)} onChange={onStyle} />
      </Row>
      {resolved?.kind === "code" ? (
        <Row label="Language">
          <Select label="Code language" all={`${resolved.language} (style)`} value={language && language !== resolved.language ? language : ""} options={CODE_LANGUAGES.map((l) => ({ value: l, label: l }))} onChange={(l) => onLanguage((l || resolved.language) as CodeLanguage)} />
        </Row>
      ) : null}
    </div>
  );
}
