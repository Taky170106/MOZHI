"""Recover the figures and the full text from the delivered paper.

Windows cleared the temp directory that held build_paper.py and the figure
PNGs, but the images are still inside the generated docx (word/media), so
they can be lifted straight back out. The paragraph text is lifted with them
so the prose can be reused without retyping it.

    python recover.py
"""
import os
import re
import shutil
import zipfile
from xml.etree import ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = r"D:\VIT\FALL26\NLP_NEW\Mozhi-ISL-IEEE-Paper-figs.docx"
OUT = os.path.join(HERE, "recovered")
os.makedirs(OUT, exist_ok=True)

z = zipfile.ZipFile(SRC)

media = [n for n in z.namelist() if n.startswith("word/media/")]
print("media parts in the package:")
names = []
for n in sorted(media):
    data = z.read(n)
    dst = os.path.join(OUT, os.path.basename(n))
    with open(dst, "wb") as fh:
        fh.write(data)
    names.append(dst)
    print("  %-18s %8d bytes -> %s" % (os.path.basename(n), len(data), dst))

# The drawing order in document.xml tells us which image is which figure.
doc = z.read("word/document.xml").decode("utf-8")
rels = z.read("word/_rels/document.xml.rels").decode("utf-8")
rid_to_target = dict(
    (m.group(1), m.group(2))
    for m in re.finditer(r'Id="([^"]+)"[^>]*Target="([^"]+)"', rels)
)
order = re.findall(r'r:embed="([^"]+)"', doc)
print("\ndrawings appear in this order:")
for i, rid in enumerate(order, 1):
    tgt = rid_to_target.get(rid, "?")
    print("  Fig slot %d -> %s" % (i, tgt))

# ---- text --------------------------------------------------------------
root = ET.fromstring(doc)
W = root.tag.split("}")[0] + "}"

body = root.find(W + "body")
lines = []
for child in body:
    if child.tag == W + "sectPr":
        continue
    style = ""
    ppr = child.find(W + "pPr")
    if ppr is not None:
        ps = ppr.find(W + "pStyle")
        if ps is not None:
            style = ps.get(W + "val") or ""
    if child.tag == W + "tbl":
        lines.append("[TABLE]")
        for tr in child.findall(W + "tr"):
            cells = []
            for tc in tr.findall(W + "tc"):
                cells.append(" ".join(
                    "".join(t.text or "" for t in p.iter(W + "t"))
                    for p in tc.findall(W + "p")))
            lines.append("  | " + " | ".join(cells))
        lines.append("[/TABLE]")
        continue
    text = "".join(t.text or "" for t in child.iter(W + "t"))
    lines.append("<%-14s %s" % (style, text))

txt = os.path.join(OUT, "paper_text.txt")
with open(txt, "w", encoding="utf-8") as fh:
    fh.write("\n".join(lines))
print("\n%-40s %d block lines" % (txt, len(lines)))
