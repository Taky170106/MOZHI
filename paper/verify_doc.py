"""Structural and citation audit of Mozhi-Project-Document.docx.

The package is opened and checked without Word, because a document can be
well-formed and still be wrong: a heading whose prefix was typed by hand, a
reference listed but never cited, a column count that quietly reverted, a
table wider than the page.

The citation audit is the important one. A reference that appears in the
list but not in the text is not cited, and a citation in the text that has
no entry in the list is broken. Both directions are checked.

    python verify_doc.py [file.docx]
"""
import os
import re
import sys
import zipfile
from xml.etree import ElementTree as ET

DOCX = (sys.argv[1] if len(sys.argv) > 1
        else r"D:\VIT\FALL26\NLP_NEW\Mozhi-Project-Document.docx")

STRICT_W = "http://purl.oclc.org/ooxml/wordprocessingml/main"
STRICT_R = ("http://purl.oclc.org/ooxml/officeDocument/relationships")

TEXT_W_PT = 506.00          # A4 595.30 minus 44.65 margins each side
TOTAL_W = 10100             # twips the generator uses for a table
EMU_PER_PT = 12700

# Every prefix the template generates. If any of these appears as typed text
# at the head of its paragraph, the document would show a doubled prefix.
GENERATED_PREFIX = [
    ("Heading1", re.compile(r"^(?:I|II|III|IV|V|VI|VII|VIII|IX|X)\.\s")),
    ("Heading2", re.compile(r"^[A-Z]\.\s")),
    ("Heading3", re.compile(r"^\d+\)\s")),
    ("figurecaption", re.compile(r"^Fig\.\s\d+\.\s")),
    ("tablehead", re.compile(r"^TABLE\s\d+\.\s")),
    ("references", re.compile(r"^\[\d+\]\s")),
]

CITE_RE = re.compile(r"\[(\d+)\]")

# The template writes page geometry as a measurement string rather than a
# bare twip count -- "595.30pt", "44.65pt" -- so parse it back to points.
MEASURE_RE = re.compile(r"^([\d.]+)(pt|cm|mm|in|pc|px)?$")
TO_PT = {None: 1 / 20.0, "pt": 1.0, "cm": 72 / 2.54, "mm": 72 / 25.4,
         "in": 72.0, "pc": 12.0, "px": 0.75}


def to_pt(value):
    """Convert an OOXML measurement, twips by default, to points."""
    m = MEASURE_RE.match(value.strip())
    if not m:
        raise ValueError("not a measurement: %r" % value)
    return float(m.group(1)) * TO_PT[m.group(2)]


errors = []
notes = []


def err(msg):
    errors.append(msg)


def note(msg):
    notes.append(msg)


# ------------------------------------------------------------------ package
if not os.path.exists(DOCX):
    raise SystemExit("not found: %s" % DOCX)

z = zipfile.ZipFile(DOCX)
bad = z.testzip()
if bad:
    err("zip member failed CRC: %s" % bad)

names = z.namelist()
doc = z.read("word/document.xml").decode("utf-8")

root = ET.fromstring(doc)
if root.tag != "{%s}document" % STRICT_W:
    err("root element is %s, expected the strict w:document" % root.tag)
# The root open tag, not the XML declaration, is where the prefixes live.
root_open = re.search(r"<w:document\b[^>]*>", doc)
if not root_open or 'xmlns:w="%s"' % STRICT_W not in root_open.group(0):
    err("the w: prefix does not declare the strict namespace")
if "ns0:" in doc:
    err("namespace prefix ns0: leaked into document.xml (%d)" % doc.count("ns0:"))

W = "{%s}" % STRICT_W
R = "{%s}" % STRICT_R


def _style_of(p):
    """The style id of a paragraph, or None if it has none."""
    ps = p.find(W + "pPr/" + W + "pStyle")
    return ps.get(W + "val") if ps is not None else None


body = root.find(W + "body")
if body is None:
    raise SystemExit("no body element")

# --------------------------------------------------------------- geometry
sectPrs = list(body.findall(W + "sectPr"))
para_sectPrs = [p for p in body.iter(W + "p")
                if p.find(W + "pPr/" + W + "sectPr") is not None]
if len(sectPrs) != 1:
    err("body carries %d sectPr, expected exactly 1" % len(sectPrs))
if para_sectPrs:
    err("%d paragraph-level section breaks -- the document is not a single "
        "section" % len(para_sectPrs))

if sectPrs:
    cols = sectPrs[0].find(W + "cols")
    if cols is not None and cols.get(W + "num") not in (None, "1"):
        err("section specifies %s columns, expected 1"
            % cols.get(W + "num"))
    pg = sectPrs[0].find(W + "pgSz")
    if pg is not None:
        w = to_pt(pg.get(W + "w"))
        note("page %.2f x %.2f pt" % (w, to_pt(pg.get(W + "h"))))
    mar = sectPrs[0].find(W + "pgMar")
    if mar is not None:
        left = to_pt(mar.get(W + "left"))
        right = to_pt(mar.get(W + "right"))
        avail = w - left - right
        note("margins %.2f / %.2f pt -> %.2f pt of text width"
             % (left, right, avail))
        if abs(avail - TEXT_W_PT) > 0.5:
            err("computed text width %.2f pt but the generator assumed %.2f"
                % (avail, TEXT_W_PT))

# ------------------------------------------------------------ style census
styles = {}
paragraphs = []
for p in body.iter(W + "p"):
    ppr = p.find(W + "pPr")
    sid = None
    if ppr is not None:
        ps = ppr.find(W + "pStyle")
        if ps is not None:
            sid = ps.get(W + "val")
    text = "".join(t.text or "" for t in p.iter(W + "t"))
    styles[sid] = styles.get(sid, 0) + 1
    paragraphs.append((sid, text, p))

expect = [
    ("papertitle", 1), ("Author", 3), ("Affiliation", 1),
    ("Abstract", 1), ("Keywords", 1),
    ("Heading1", 7), ("Heading2", 18), ("Heading3", 4),
    ("references", 14), ("tablehead", 7), ("figurecaption", 3),
]
for sid, want in expect:
    got = styles.get(sid, 0)
    if got != want:
        err("style %-14s used %d times, expected %d" % (sid, got, want))
    else:
        note("style %-14s x%d" % (sid, got))

# The boxed pseudocode is prose too, but its top[0] and recent[0] are array
# subscripts rather than citations, so the citation audit has to know which
# paragraphs are boxes and leave them out of the count.
ALGO_IDS = set(id(p) for sid, _t, p in paragraphs
               if sid == "BodyText"
               and p.find(W + "pPr/" + W + "pBdr/" + W + "left") is not None)

# Text that is not inside a run is accepted by Word without a repair prompt
# and then silently dropped on the page. The title block of this document
# did exactly that on its first build. Every character has to sit in a w:t
# under a w:r, so look for text hanging directly off the paragraph.
bare = [(sid, text) for sid, text, p in paragraphs if (p.text or "").strip()]
if bare:
    for sid, text in bare[:4]:
        err("%s paragraph carries text outside any run: %r"
            % (sid or "unnamed", text[:55]))
    if len(bare) > 4:
        err("...and %d more paragraphs the same way" % (len(bare) - 4))
else:
    note("every character sits inside a run")

# ------------------------------------------------------------ body content
n_tbl = len(list(body.iter(W + "tbl")))
n_draw = len(list(body.iter(W + "drawing")))
if n_tbl != 7:
    err("found %d tables, expected 7" % n_tbl)
if n_draw != 3:
    err("found %d drawings, expected 3" % n_draw)

# Each figure must fit inside the text width.
for ext in body.iter(W + "extent"):
    cx = int(ext.get("cx"))
    pt = cx / float(EMU_PER_PT)
    if pt > TEXT_W_PT:
        err("an image is %.1f pt wide, wider than the %.1f pt text column"
            % (pt, TEXT_W_PT))
    else:
        note("image extent %.1f pt wide" % pt)

# Each table must be exactly the declared width, and no row may exceed it.
for tbl in body.iter(W + "tbl"):
    grid = tbl.find(W + "tblGrid")
    if grid is None:
        err("a table has no tblGrid")
        continue
    total = sum(int(c.get(W + "w")) for c in grid.findall(W + "gridCol"))
    if total != TOTAL_W:
        err("a table grid sums to %d twips, expected %d" % (total, TOTAL_W))

# ------------------------------------------------- generated prefixes typed?
for sid, text, _p in paragraphs:
    for style, pat in GENERATED_PREFIX:
        if sid == style and pat.match(text):
            err("%s paragraph begins with a typed prefix %r -- the number "
                "is generated, so it would render doubled"
                % (style, text[:12]))

# ------------------------------------------------------------ the citations
# Walk the top-level blocks so the reference list can be told apart from the
# body: everything after the last Heading1 is the list.
h1_index = [i for i, ch in enumerate(body)
            if ch.tag == W + "p"
            and ch.find(W + "pPr/" + W + "pStyle") is not None
            and ch.find(W + "pPr/" + W + "pStyle").get(W + "val") == "Heading1"]

ref_start = None
for i in h1_index:
    p = body[i]
    text = "".join(t.text or "" for t in p.iter(W + "t"))
    if text.strip() == "References":
        ref_start = i

if ref_start is None:
    err("no Heading1 named References")
    cited, defined = set(), set()
else:
    before, after = [], []
    for i, ch in enumerate(body):
        if ch.tag != W + "p":
            continue
        text = "".join(t.text or "" for t in ch.iter(W + "t"))
        if i <= ref_start:
            before.append((i, ch, text))
        else:
            after.append((i, ch, text))

    cited = set()
    for i, ch, text in before:
        if id(ch) in ALGO_IDS:
            continue
        for m in CITE_RE.finditer(text):
            cited.add(int(m.group(1)))

    # The list is numbered by its style, so entry text carries no [n].
    # Count the paragraphs that actually carry the references style, and
    # complain about anything else sitting below the heading.
    entries = [(i, text) for i, _ch, text in after
               if _style_of(body[i]) == "references"]
    strays = [(i, text) for i, _ch, text in after
              if _style_of(body[i]) != "references" and text.strip()]
    if strays:
        err("%d non-reference paragraphs below the heading, e.g. %r"
            % (len(strays), strays[0][1][:50]))
    defined = set(range(1, len(entries) + 1))
    if len(entries) != 14:
        err("the reference list holds %d entries, expected 14" % len(entries))

    # the citation itself must be a superscript run, as IEEE expects
    sup_cites = 0
    for i, _ch, text in before:
        p = body[i]
        for r in p.iter(W + "r"):
            rpr = r.find(W + "rPr")
            if rpr is None:
                continue
            va = rpr.find(W + "vertAlign")
            if va is not None and va.get(W + "val") == "superscript":
                t = "".join(x.text or "" for x in r.iter(W + "t"))
                if CITE_RE.fullmatch(t):
                    sup_cites += 1
    if sup_cites == 0:
        err("no citation is set as a superscript run")
    else:
        note("%d superscripted citations in the body" % sup_cites)

    missing = defined - cited
    if missing:
        err("references %s are listed but never cited in the text"
            % ", ".join("[%d]" % n for n in sorted(missing)))
    orphans = cited - defined
    if orphans:
        err("the text cites %s, which have no entry in the list"
            % ", ".join("[%d]" % n for n in sorted(orphans)))
    if not missing and not orphans:
        note("citation audit: all %d references are cited, all citations "
             "resolve" % len(defined))

# ---------------------------------------------------------- media and parts
media = [n for n in names if n.startswith("word/media/")]
if len(media) != 3:
    err("package holds %d media parts, expected 3" % len(media))
rels = z.read("word/_rels/document.xml.rels").decode("utf-8")
for m in re.finditer(r'Id="([^"]+)"[^>]*Target="(media/[^"]+)"', rels):
    if m.group(1) not in doc:
        err("relationship %s is declared but never referenced" % m.group(1))
n_embed = len(re.findall(r'r:embed="[^"]+"', doc))
if n_embed != len(media):
    err("%d r:embed references for %d media parts" % (n_embed, len(media)))

types = z.read("[Content_Types].xml").decode("utf-8")
if 'Extension="png"' not in types:
    err("no png content type is declared")

# -------------------------------------------------------------- algorithm
algo = [p for _sid, _t, p in paragraphs if id(p) in ALGO_IDS]
if len(algo) != 2:
    err("found %d boxed algorithm listings, expected 2" % len(algo))

# A monospaced line wider than its box wraps, and a wrapped pseudocode line
# reads as though it were a second statement. Measure the widest line of
# each box against the space the paragraph indents leave for it. Courier
# New advances 0.6 em per character; the boxes are set at 8 pt.
ALGO_PT_PER_CHAR = 0.6 * 8.0
for p in algo:
    text = "".join(t.text or "" for t in p.iter(W + "t"))
    note("algorithm box: %s" % text[:58].replace("\n", " "))

    ppr = p.find(W + "pPr")
    ind = ppr.find(W + "ind") if ppr is not None else None
    left = to_pt(ind.get(W + "left", "0")) if ind is not None else 0.0
    right = to_pt(ind.get(W + "right", "0")) if ind is not None else 0.0
    pad = 0.0
    border = ppr.find(W + "pBdr") if ppr is not None else None
    if border is not None:
        for side in ("left", "right"):
            el = border.find(W + side)
            if el is not None:
                pad += float(el.get(W + "space", "0"))
    avail = TEXT_W_PT - left - right - pad

    # Walk the runs the way Word lays them out. The trailing italic note is
    # prose and is meant to wrap, so measuring stops at the first run that
    # is not Courier New.
    lines, cur = [], ""
    for r in p.iter(W + "r"):
        rpr = r.find(W + "rPr")
        fonts = rpr.find(W + "rFonts") if rpr is not None else None
        mono = fonts is not None and fonts.get(W + "ascii") == "Courier New"
        if r.find(W + "br") is not None:
            lines.append(cur)
            cur = ""
            continue
        txt = "".join(t.text or "" for t in r.iter(W + "t"))
        if not txt:
            continue
        if not mono:
            break
        cur += txt
    lines.append(cur)

    longest = max(lines, key=len)
    need = len(longest) * ALGO_PT_PER_CHAR
    if need > avail:
        err("a pseudocode line is %d chars (%.0f pt) but the box leaves "
            "%.0f pt, so it wraps: %r"
            % (len(longest), need, avail, longest.strip()[:50]))
    else:
        note("widest pseudocode line %d chars in %.0f pt of box -- fits"
             % (len(longest), avail))

# ----------------------------------------------------------------- report
print("=" * 66)
print(os.path.basename(DOCX), "  %d bytes, %d parts"
      % (os.path.getsize(DOCX), len(names)))
print("=" * 66)
for m in notes:
    print("  ok    %s" % m)
print()
if errors:
    for m in errors:
        print("  FAIL  %s" % m)
    print()
    print("%d PROBLEM(S)" % len(errors))
else:
    print("no problems found")
raise SystemExit(1 if errors else 0)
