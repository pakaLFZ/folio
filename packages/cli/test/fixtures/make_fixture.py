"""Write fixture.pptx, the small deck the pptx importer test reads.

Run: python make_fixture.py (needs python-pptx). It starts from python-pptx's
default template on a 960 x 540 pt canvas and adds what the importer must
read: a black variant of "Title Only", a logo picture and a wordmark text box
on "Title Slide", a named table style, and three slides: two with the same
hand-made structure (note, label, picture, table, caption), one on the black
variant with only its title.
"""
import io
import struct
import zlib
from pathlib import Path

from lxml import etree
from pptx import Presentation
from pptx.opc.constants import CONTENT_TYPE as CT, RELATIONSHIP_TYPE as RT
from pptx.opc.packuri import PackURI
from pptx.parts.slide import SlideLayoutPart
from pptx.util import Pt

HERE = Path(__file__).parent
A = "http://schemas.openxmlformats.org/drawingml/2006/main"
P = "http://schemas.openxmlformats.org/presentationml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
NS = f'xmlns:a="{A}" xmlns:p="{P}" xmlns:r="{R}"'
STYLE_ID = "{11111111-2222-3333-4444-555555555555}"
EMU = 12700


def png(rgb):
    """A 4 x 4 PNG of one colour."""
    row = b"\x00" + bytes(rgb) * 4
    chunk = lambda tag, data: struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data))
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 4, 4, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(row * 4)) + chunk(b"IEND", b"")


def xfrm(x, y, w, h):
    return f'<a:xfrm><a:off x="{x * EMU}" y="{y * EMU}"/><a:ext cx="{w * EMU}" cy="{h * EMU}"/></a:xfrm>'


def add_black_variant(prs):
    """Copy "Title Only" as "Title Only Black" with a black background."""
    master = prs.slide_master
    source = prs.slide_layouts.get_by_name("Title Only")
    element = etree.fromstring(etree.tostring(source._element))
    csld = element.find(f"{{{P}}}cSld")
    csld.set("name", "Title Only Black")
    csld.insert(0, etree.fromstring(f'<p:bg {NS}><p:bgPr><a:solidFill><a:srgbClr val="000000"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>'))
    part = SlideLayoutPart.load(PackURI("/ppt/slideLayouts/slideLayout12.xml"), CT.PML_SLIDE_LAYOUT, prs.part.package, etree.tostring(element))
    part.relate_to(master.part, RT.SLIDE_MASTER)
    rid = master.part.relate_to(part, RT.SLIDE_LAYOUT)
    ids = master._element.find(f"{{{P}}}sldLayoutIdLst")
    ids.append(etree.fromstring(f'<p:sldLayoutId {NS} id="2147483660" r:id="{rid}"/>'))


def decorate_title_slide(prs):
    """A logo picture and a wordmark text box on "Title Slide"."""
    layout = prs.slide_layouts.get_by_name("Title Slide")
    _, rid = layout.part.get_or_add_image_part(io.BytesIO(png((200, 30, 30))))
    tree = layout.shapes._spTree
    tree.append(etree.fromstring(f'<p:pic {NS}><p:nvPicPr><p:cNvPr id="90" name="Logo"/><p:cNvPicPr/><p:nvPr userDrawn="1"/></p:nvPicPr><p:blipFill><a:blip r:embed="{rid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>{xfrm(880, 20, 60, 30)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>'))
    tree.append(etree.fromstring(f'<p:sp {NS}><p:nvSpPr><p:cNvPr id="91" name="Wordmark"/><p:cNvSpPr txBox="1"/><p:nvPr userDrawn="1"/></p:nvSpPr><p:spPr>{xfrm(20, 20, 300, 40)}</p:spPr><p:txBody><a:bodyPr lIns="0" tIns="0" rIns="0" bIns="0"/><a:lstStyle/><a:p><a:r><a:rPr lang="en-GB" sz="3200" b="1"><a:latin typeface="Roboto"/></a:rPr><a:t>ACME LAB</a:t></a:r></a:p></p:txBody></p:sp>'))


def add_table_style(prs):
    """A table style with a black header row and rules between rows, as the presentation's default."""
    part = next(p for p in prs.part.package.iter_parts() if str(p.partname) == "/ppt/tableStyles.xml")
    line = '<a:ln w="12700"><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:ln>'
    none = "<a:ln><a:noFill/></a:ln>"
    borders = f"<a:left>{line}</a:left><a:right>{line}</a:right><a:top>{line}</a:top><a:bottom>{line}</a:bottom><a:insideH>{line}</a:insideH><a:insideV>{none}</a:insideV>"
    style = f'<a:tblStyle styleId="{STYLE_ID}" styleName="Lab Lines"><a:wholeTbl><a:tcTxStyle/><a:tcStyle><a:tcBdr>{borders}</a:tcBdr><a:fill><a:noFill/></a:fill></a:tcStyle></a:wholeTbl><a:firstRow><a:tcTxStyle b="on"><a:srgbClr val="FFFFFF"/></a:tcTxStyle><a:tcStyle><a:tcBdr/><a:fill><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:fill></a:tcStyle></a:firstRow></a:tblStyle>'
    part._blob = f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<a:tblStyleLst xmlns:a="{A}" def="{STYLE_ID}">{style}</a:tblStyleLst>'.encode()


def text_box(slide, name, box, text, size):
    shape = slide.shapes.add_textbox(*[Pt(v) for v in box])
    shape.name = name
    frame = shape.text_frame
    frame.margin_left = frame.margin_right = frame.margin_top = frame.margin_bottom = 0
    frame.text = text
    frame.paragraphs[0].runs[0].font.size = Pt(size)


def content_slide(prs, subtitle):
    """Title moved down, a note, a labelled picture, a table with a note under it, a caption."""
    slide = prs.slides.add_slide(prs.slide_layouts.get_by_name("Title Only"))
    slide.shapes.title.text = "RESULTS"
    slide.shapes.title.left, slide.shapes.title.top, slide.shapes.title.width, slide.shapes.title.height = Pt(30), Pt(20), Pt(900), Pt(40)
    text_box(slide, "label:a", (30, 80, 440, 23), "(a) Energy profile", 14)
    picture = slide.shapes.add_picture(io.BytesIO(png((30, 30, 200))), Pt(30), Pt(103), Pt(440), Pt(300))
    picture.name = "fig:a"
    table = slide.shapes.add_table(3, 2, Pt(490), Pt(103), Pt(440), Pt(60))
    table.name = "table:a"
    table._element.graphic.graphicData.tbl.tblPr.find(f"{{{A}}}tableStyleId").text = STYLE_ID
    for r in range(3):
        for c in range(2):
            cell = table.table.cell(r, c)
            cell.text = f"r{r}c{c}"
            cell.text_frame.paragraphs[0].runs[0].font.size = Pt(12)
    text_box(slide, "TextBox 7", (490, 200, 440, 200), subtitle + " " + "words " * 40, 14)
    text_box(slide, "caption", (30, 500, 900, 24), "One-line caption", 14)


def main():
    prs = Presentation()
    prs.slide_width, prs.slide_height = Pt(960), Pt(540)
    add_black_variant(prs)
    decorate_title_slide(prs)
    add_table_style(prs)
    content_slide(prs, "First")
    content_slide(prs, "Second")
    separator = prs.slides.add_slide(prs.slide_layouts.get_by_name("Title Only Black"))
    separator.shapes.title.text = "PART TWO"
    prs.save(HERE / "fixture.pptx")


if __name__ == "__main__":
    main()
