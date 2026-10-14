"""chem-subscripts text hook: the digits of a chemical formula become subscripts.

H2O -> H_{2}O, Fe2O3 -> Fe_{2}O_{3}, Ca(OH)2 -> Ca(OH)_{2}. A word is a
formula only when every capital starts a real element symbol and it holds a
digit, so 300 K, B3LYP, A4 and Fig2 stay as written, and text already marked
up (H_{2}O) is left alone.
"""
from __future__ import annotations

import re

from folio_hook import run

ELEMENTS = set(
    "H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr "
    "Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb "
    "Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr".split()
)
UNIT = r"(?:[A-Z][a-z]?\d*|\((?:[A-Z][a-z]?\d*)+\)\d*)"
FORMULA = re.compile(rf"(?<![\w{{}}_^]){UNIT}+(?![\w{{}}])")
SYMBOL = re.compile(r"[A-Z][a-z]?")
COUNT = re.compile(r"(?<=[A-Za-z)])(\d+)")


def is_formula(word: str) -> bool:
    """Whether a word is a chemical formula with at least one count."""
    return any(c.isdigit() for c in word) and all(s in ELEMENTS for s in SYMBOL.findall(word))


def subscript(word: str) -> str:
    """Write a formula's counts as subscripts."""
    return COUNT.sub(r"_{\1}", word) if is_formula(word) else word


def transform(request) -> str:
    """The slot's text with every formula's counts as subscripts."""
    source = request.text
    parts = []
    pos = 0
    while (start := source.find("[[", pos)) >= 0:
        parts.append(FORMULA.sub(lambda m: subscript(m.group(0)), source[pos:start]))
        bar = source.find("|", start + 2)
        end = source.find("]]", bar + 1) if bar >= 0 else -1
        if end < 0:
            parts.append(source[start:])
            return "".join(parts)
        parts.append(source[start:bar + 1])
        parts.append(FORMULA.sub(lambda m: subscript(m.group(0)), source[bar + 1:end]))
        parts.append("]]" )
        pos = end + 2
    parts.append(FORMULA.sub(lambda m: subscript(m.group(0)), source[pos:]))
    return "".join(parts)


if __name__ == "__main__":
    run(transform)
