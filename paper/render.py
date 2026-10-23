"""Render the exported PDF to PNGs so the layout can be looked at.

Word's own report of the document is not enough: the columns count as 1 and
the shapes count as 3 whether or not the pseudocode renders as intended, and
the prefixes Heading3 generates have never been exercised before in this
pipeline. Rendering makes both visible.

    python render.py [pdf] [outdir]
"""
import os
import sys

PDF = (sys.argv[1] if len(sys.argv) > 1
       else r"C:\Users\tamiz\AppData\Local\Temp\opencode\Mozhi-Project-Document.pdf")
OUT = (sys.argv[2] if len(sys.argv) > 2
       else r"C:\Users\tamiz\AppData\Local\Temp\opencode\pages")
os.makedirs(OUT, exist_ok=True)

if not os.path.exists(PDF):
    raise SystemExit("not found: %s" % PDF)

try:
    import fitz  # PyMuPDF
except ImportError:
    raise SystemExit("PyMuPDF is not installed - try `pip install PyMuPDF`")

doc = fitz.open(PDF)
print("%s: %d pages" % (os.path.basename(PDF), doc.page_count))

for i, page in enumerate(doc, 1):
    # 150 dpi keeps a full A4 page under a megabyte while leaving the
    # pseudocode legible.
    pix = page.get_pixmap(dpi=150)
    path = os.path.join(OUT, "page%02d.png" % i)
    pix.save(path)
    print("  page %2d  %4d x %4d px  -> %s"
          % (i, pix.width, pix.height, os.path.basename(path)))

doc.close()
