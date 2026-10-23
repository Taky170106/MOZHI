"""Report which symbols Courier New actually contains.

The algorithm boxes are set in Courier New, and a glyph the font lacks
renders as an empty box. Rather than guess at arrows and math operators,
read the font's character map directly.
"""
import os

CANDIDATES = {
    "\u2190": "leftwards arrow",
    "\u2192": "rightwards arrow",
    "\u2265": "greater-than or equal",
    "\u2264": "less-than or equal",
    "\u2260": "not equal",
    "\u2016": "double vertical line",
    "\u2205": "empty set",
    "\u2212": "minus sign",
    "\u2248": "almost equal to",
    "\u00d7": "multiplication sign",
    "\u00b7": "middle dot",
    "\u00b1": "plus-minus",
    "\u03b1": "greek alpha",
    "\u03a3": "greek capital sigma",
    "\u207b": "superscript minus",
    "\u2074": "superscript four",
    "\u211d": "double-struck R",
    "\u25b7": "white right-pointing triangle",
    "\u2014": "em dash",
    "\u2013": "en dash",
    "\u201c": "left double quote",
    "\u00b0": "degree sign",
}

FONT = r"C:\Windows\Fonts\cour.ttf"
print("font:", FONT, "exists:", os.path.exists(FONT))

try:
    from fontTools.ttLib import TTFont
except ImportError:
    raise SystemExit("fontTools not installed - cannot read the cmap")

font = TTFont(FONT, lazy=True)
cmap = set()
for table in font["cmap"].tables:
    cmap.update(table.cmap.keys())

missing = []
for ch, name in sorted(CANDIDATES.items()):
    ok = ord(ch) in cmap
    if not ok:
        missing.append(ch)
    print("  %-30s U+%04X  %s" % (name, ord(ch), "present" if ok else "MISSING"))

print()
if missing:
    print("MISSING from Courier New -> replace before building:")
    for ch in missing:
        print("   %r  U+%04X" % (ch, ord(ch)))
else:
    print("all candidate glyphs are present in Courier New")
