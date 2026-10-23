"""Build Mozhi-Project-Document.docx — the single-column project report.

Structure requested by the author:

    Abstract  Introduction  Related Work  Method  Experimentation
    Results and Analysis  Conclusion  References

Method carries the design architecture, pseudocode and the illustrations;
Experimentation carries the dataset. Unlike the IEEE conference paper this is
one column throughout, because the pseudocode has to be readable and it will
not fit in a 243 pt column.

Numbering comes from numbering.xml and must never be typed by hand:
    Heading1 -> I.   Heading2 -> A.   Heading3 -> 1)
    figurecaption -> Fig. N.   tablehead -> TABLE N.
    references -> [N]   bulletlist -> bullet
The three figures were recovered from the delivered IEEE paper (the temp
directory that held the originals was cleared), so they are read back out of
its word/media part.

    python build_doc.py [output.docx]
"""
import os
import re
import shutil
import sys
import zipfile
from xml.etree import ElementTree as ET
from xml.sax.saxutils import escape

TPL = r"C:\Users\tamiz\Downloads\conference-template-a4.docx"
OUT = (sys.argv[1] if len(sys.argv) > 1
       else r"D:\VIT\FALL26\NLP_NEW\Mozhi-Project-Document.docx")
HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE_DOCX = r"D:\VIT\FALL26\NLP_NEW\Mozhi-ISL-IEEE-Paper-figs.docx"

FIG1 = os.path.join(HERE, "recovered", "image1.png")
FIG2 = os.path.join(HERE, "recovered", "image2.png")
FIG3 = os.path.join(HERE, "recovered", "image3.png")

# A4 595.30pt wide, margins 44.65pt each side -> 506.00pt of text. The
# tables sit 1pt inside that, the figures 1pt inside that.
TOTAL_W = 10100            # twips == 505.0 pt
FIG_W_PT = 505.0

EMU_PER_PT = 12700
A_NS = "http://purl.oclc.org/ooxml/drawingml/main"
PIC_NS = "http://purl.oclc.org/ooxml/drawingml/picture"
IMG_REL = "http://purl.oclc.org/ooxml/officeDocument/relationships/image"

IMAGES = []                # [(part name, source path, relationship id)]
_DOCPR = [1000]            # docPr / cNvPr ids must be unique per drawing


# ------------------------------------------------------------------ runs
CITE_RE = re.compile(r"(\[\d+\])")


def run(text, b=False, i=False, sz=None, mono=False, sup=False, color=None):
    rpr = ""
    if mono:
        rpr += ('<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" '
                'w:cs="Courier New"/>')
    if b:
        rpr += "<w:b/>"
    if i:
        rpr += "<w:i/>"
    if color:
        rpr += '<w:color w:val="%s"/>' % color
    if sz:
        rpr += '<w:sz w:val="%d"/><w:szCs w:val="%d"/>' % (sz, sz)
    if sup:
        rpr += '<w:vertAlign w:val="superscript"/>'
    rpr = "<w:rPr>%s</w:rPr>" % rpr if rpr else ""
    return ('<w:r>%s<w:t xml:space="preserve">%s</w:t></w:r>'
            % (rpr, escape(text)))


def marked(text):
    """Split prose so that every [n] citation becomes a superscript run.

    Citations are the one thing that must survive into the text: a reference
    listed but never cited is not a citation.
    """
    out = ""
    for part in CITE_RE.split(escape(text)):
        if not part:
            continue
        out += run(part, sup=True) if CITE_RE.fullmatch(part) else run(part)
    return out


def br():
    return "<w:r><w:br/></w:r>"


def para(style, runs, extra=""):
    return ('<w:p><w:pPr><w:pStyle w:val="%s"/>%s</w:pPr>%s</w:p>'
            % (style, extra, runs))


def body(text):
    return para("BodyText", marked(text))


def bullet(text):
    return para("bulletlist", marked(text))


def h1(text):
    return para("Heading1", marked(text))


def h2(text):
    return para("Heading2", marked(text))


def h3(text):
    return para("Heading3", marked(text))


def ref(text):
    return para("references", marked(text),
                extra='<w:ind w:start="17.70pt" w:hanging="17.70pt"/>')


def equation(text):
    return para("equation", marked(text),
                extra='<w:jc w:val="center"/>')


# ------------------------------------------------------------- algorithm
def algorithm(title, lines, note=None):
    """A boxed, monospaced pseudocode listing.

    The template has no algorithm style, so unlike headings and figure
    captions this prefix is typed rather than generated -- numbering.xml
    only drives the styles that carry a numId.
    """
    runs = run(title, b=True, mono=True, sz=16)
    for ln in lines:
        runs += br() + run(ln, mono=True, sz=16)
    if note:
        runs += br() + br() + run(note, i=True, mono=False, sz=16, color="595959")
    ppr = ('<w:pBdr>'
           '<w:top w:val="single" w:sz="6" w:space="6" w:color="404040"/>'
           '<w:left w:val="single" w:sz="6" w:space="6" w:color="404040"/>'
           '<w:bottom w:val="single" w:sz="6" w:space="6" w:color="404040"/>'
           '<w:right w:val="single" w:sz="6" w:space="6" w:color="404040"/>'
           '</w:pBdr>'
           '<w:shd w:val="clear" w:color="auto" w:fill="F5F5F5"/>'
           '<w:spacing w:before="8pt" w:after="8pt" w:line="240" '
           'w:lineRule="auto"/>'
           '<w:ind w:left="10pt" w:right="10pt" w:firstLine="0pt"/>'
           '<w:jc w:val="left"/>')
    return '<w:p><w:pPr><w:pStyle w:val="BodyText"/>%s</w:pPr>%s</w:p>' % (
        ppr, runs)


# ---------------------------------------------------------------- tables
def _cell(text, width, style):
    return ('<w:tc><w:tcPr><w:tcW w:w="%d" w:type="dxa"/>'
            '<w:vAlign w:val="center"/></w:tcPr>'
            '<w:p><w:pPr><w:pStyle w:val="%s"/></w:pPr>'
            '<w:r><w:t xml:space="preserve">%s</w:t></w:r></w:p></w:tc>'
            % (width, style, escape(str(text))))


def table(title, headers, rows, fracs=None, note=None):
    n = len(headers)
    fracs = fracs or [1.0 / n] * n
    w = [int(TOTAL_W * f) for f in fracs]
    w[-1] = TOTAL_W - sum(w[:-1])

    grid = "".join('<w:gridCol w:w="%d"/>' % x for x in w)
    trs = ['<w:tr><w:trPr><w:tblHeader/></w:trPr>%s</w:tr>' % "".join(
        _cell(c, w[i], "tablecolhead") for i, c in enumerate(headers))]
    for r in rows:
        trs.append('<w:tr>%s</w:tr>' % "".join(
            _cell(c, w[i], "tablecopy") for i, c in enumerate(r)))

    borders = "".join(
        '<w:%s w:val="single" w:sz="4" w:space="0" w:color="808080"/>'
        % side for side in
        ("top", "left", "bottom", "right", "insideH", "insideV"))

    out = para("tablehead", marked(title))
    out += ('<w:tbl><w:tblPr>'
            '<w:tblStyle w:val="TableNormal"/>'
            '<w:tblW w:w="%d" w:type="dxa"/>'
            '<w:tblBorders>%s</w:tblBorders>'
            '<w:tblLayout w:type="fixed"/>'
            '</w:tblPr><w:tblGrid>%s</w:tblGrid>%s</w:tbl>'
            % (TOTAL_W, borders, grid, "".join(trs)))
    if note:
        out += para("tablecopy", marked(note))
    return out


# --------------------------------------------------------------- figures
def image(path, width_pt=FIG_W_PT):
    """An inline picture scaled to the column, aspect taken from the PNG."""
    from PIL import Image as _Im
    w, h = _Im.open(path).size
    cx = int(round(width_pt * EMU_PER_PT))
    cy = int(round(cx * h / float(w)))

    n = len(IMAGES) + 1
    name = "image%d.png" % n
    rid = "rIdPic%d" % n
    IMAGES.append((name, path, rid))

    _DOCPR[0] += 1
    pid = _DOCPR[0]
    drawing = (
        '<w:drawing>'
        '<wp:inline distT="0" distB="0" distL="0" distR="0">'
        '<wp:extent cx="%d" cy="%d"/>'
        '<wp:effectExtent l="0" t="0" r="0" b="0"/>'
        '<wp:docPr id="%d" name="Picture %d"/>'
        '<wp:cNvGraphicFramePr>'
        '<a:graphicFrameLocks xmlns:a="%s" noChangeAspect="1"/>'
        '</wp:cNvGraphicFramePr>'
        '<a:graphic xmlns:a="%s">'
        '<a:graphicData uri="%s">'
        '<pic:pic xmlns:pic="%s">'
        '<pic:nvPicPr>'
        '<pic:cNvPr id="%d" name="Picture %d"/>'
        '<pic:cNvPicPr/>'
        '</pic:nvPicPr>'
        '<pic:blipFill>'
        '<a:blip r:embed="%s"/>'
        '<a:stretch><a:fillRect/></a:stretch>'
        '</pic:blipFill>'
        '<pic:spPr bwMode="auto">'
        '<a:xfrm><a:off x="0" y="0"/><a:ext cx="%d" cy="%d"/></a:xfrm>'
        '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>'
        '</pic:spPr>'
        '</pic:pic>'
        '</a:graphicData>'
        '</a:graphic>'
        '</wp:inline>'
        '</w:drawing>'
    ) % (cx, cy, pid, pid, A_NS, A_NS, PIC_NS, PIC_NS, pid, pid, rid, cx, cy)

    ppr = ('<w:spacing w:before="6pt" w:after="2pt"/>'
           '<w:ind w:firstLine="0pt"/>'
           '<w:jc w:val="center"/>')
    return ('<w:p><w:pPr><w:pStyle w:val="BodyText"/>%s</w:pPr>'
            '<w:r><w:rPr><w:noProof/></w:rPr>%s</w:r></w:p>'
            % (ppr, drawing))


def figure(path, caption):
    return image(path) + para("figurecaption", marked(caption))


# ================================================================ CONTENT
def front_matter():
    c = []
    c.append(para("papertitle", run(
        "Mozhi: A Real-Time Indian Sign Language Terminal "
        "for the Hospital Counter with Bilingual Caption and Speech")))
    for i in (1, 2, 3):
        c.append(para("Author", run(
            "[AUTHOR %d NAME] [DEPARTMENT], [UNIVERSITY]" % i)))
    c.append(para("Affiliation", run(
        "[Corresponding author e-mail address]")))
    c.append(para("Abstract", marked(
        "Abstract\u2014A deaf or hard-of-hearing visitor at a hospital "
        "counter is usually left to pantomime, write a note, or bring a "
        "relative along to interpret. This paper presents Mozhi, a browser "
        "terminal that recognises isolated Indian Sign Language glosses "
        "from an ordinary webcam and replies in both text and speech, so "
        "the exchange can be read and heard by everyone at the counter. "
        "The recognition chain couples MediaPipe hand and pose landmarks "
        "with a 175,389-parameter bidirectional GRU and temporal-attention "
        "classifier over a fixed 30-frame window, exported to ONNX and "
        "executed in the browser so that no inference server sits in the "
        "path. The classifier is trained on 1,305 labelled clips covering "
        "a 29-word clinical reception vocabulary signed by three signers, "
        "and reaches 98.1% (256/261) on a stratified held-out split. "
        "Because a terminal that fires when nobody is signing is worse "
        "than one that stays silent, a ten-stage decision layer \u2014 "
        "confidence floor, hand onset, span gate, motion-based rest "
        "detection, stability agreement, smoothing and debouncing \u2014 "
        "rejects phantom predictions, and every gate is reported together "
        "with its measured cost to latency. The first accepted word "
        "appears 1.29 s after signing begins, against 1.42 s before onset "
        "buffering. Captions are bilingual English and Tamil, chosen by "
        "voice or by touch, and are spoken by the browser's offline "
        "synthesiser with the voice selected by script rather than by "
        "setting.")))
    c.append(para("Keywords", marked(
        "Keywords\u2014Indian sign language, isolated sign recognition, "
        "MediaPipe, bidirectional GRU, temporal attention, human\u2013"
        "computer interaction, speech synthesis")))
    return "".join(c)


def sec_intro():
    c = [h1("Introduction")]
    c.append(body(
        "Roughly 70 million deaf and hard-of-hearing people worldwide use "
        "a sign language as their primary means of communication [2], and "
        "Indian Sign Language is the everyday language of a large deaf "
        "community in India. Most public counters nevertheless remain "
        "staffed by people who do not sign. A deaf visitor at a hospital "
        "reception is left with three poor options: pantomime, a written "
        "note, or a relative acting as an interpreter. The first two are "
        "unreliable and the third is a privacy problem that is not always "
        "available. The cost is not inconvenience. It is a wrong cup of "
        "water, a wrong room, or a missed emergency."))
    c.append(body(
        "Sign-language recognition has improved sharply, but two very "
        "different failures are usually reported as one number. A miss "
        "costs the visitor a retry. A false accept \u2014 the counter "
        "acting on a word that was never signed \u2014 costs the visitor "
        "something wrong actually happening to them, and it is the failure "
        "that makes a deployed terminal unusable rather than merely "
        "irritating. Published accuracy figures almost always measure the "
        "first failure, on pre-segmented clips supplied by the evaluator, "
        "and say little about the second or about how the system knows a "
        "sign has begun."))
    c.append(body(
        "This document describes Mozhi, a browser-based terminal for the "
        "reception counter. It recognises 29 ISL glosses, displays them as "
        "a caption that can be read in English and Tamil, speaks the "
        "transcript aloud, and drives an avatar named Meenu that signs the "
        "recognised glosses back. Everything runs client-side: landmarks "
        "come from MediaPipe, the classifier is an ONNX graph evaluated "
        "in WebAssembly, and speech is the browser's own synthesis. No "
        "video leaves the machine and no inference server is required."))
    c.append(body("The contributions are:"))
    c.append(bullet(
        "A 29-gloss clinical reception vocabulary and a 1,305-clip ISL "
        "dataset from three signers, collected through a landmark-only "
        "pipeline that never writes a camera frame to disk."))
    c.append(bullet(
        "A 175,389-parameter bidirectional GRU with temporal attention, "
        "exported to ONNX at 707 kB and executed in the browser at well "
        "under one millisecond per classification window."))
    c.append(bullet(
        "A ten-stage decision layer that decides when a sign has begun "
        "and whether it may be trusted, with every threshold stated and "
        "its cost to latency measured rather than asserted."))
    c.append(bullet(
        "A bilingual English/Tamil caption and speech output whose voice "
        "is chosen by script rather than by setting, selected either by "
        "voice or by touch."))
    c.append(body(
        "Section II reviews the related work this builds on. Section III "
        "sets out the method: the design architecture, the recognition "
        "algorithm in pseudocode, and then each stage in turn. Section IV "
        "describes the dataset and the experimental setup. Section V "
        "presents the results, their analysis and the limitations that "
        "bound them, and Section VI concludes."))
    return "".join(c)


def sec_related():
    c = [h1("Related Work")]
    c.append(h2("Isolated Sign Recognition and Its Datasets"))
    c.append(body(
        "Isolated sign recognition classifies a single sign from a short "
        "clip, as opposed to continuous recognition of running signing, "
        "and remains the tractable setting for a counter terminal. Sharma "
        "and Singh [1] developed a deep-learning ISL model over a 65-user "
        "corpus; earlier ISL systems relied on hand-crafted visual "
        "features. The largest recent progress has come from dataset "
        "scale rather than architecture. ASL Citizen [2] contains 83,399 "
        "crowdsourced videos covering 2,731 signs from 52 signers, and "
        "reports 63% accuracy evaluated entirely on signers absent from "
        "training and validation. PopSign ASL v1.0 [3] collects over "
        "210,000 examples of 250 signs from 47 consenting Deaf adults, "
        "with an LSTM baseline reaching 84.2% on its held-out test "
        "signers."))
    c.append(body(
        "Those numbers are not directly comparable to ours and the "
        "difference is structural rather than rhetorical. Both corpora "
        "are an order of magnitude larger, span two to three orders of "
        "magnitude more classes, and are scored per signer, which is the "
        "harder and more honest protocol. Our corpus is 1,305 clips "
        "across 29 classes and is split by clip, with all three signers "
        "present on both sides of the split. Our 98.1% therefore reflects "
        "a small, closed, in-domain vocabulary \u2014 appropriate for a "
        "reception counter and not a claim about signer-independent "
        "recognition. Section V-F returns to this explicitly."))
    c.append(h2("Landmark Estimation Rather Than Raw Pixels"))
    c.append(body(
        "The alternative to learning from pixels is to learn from a "
        "skeleton. MediaPipe provides a cross-platform perception "
        "framework [4] and a real-time hand tracker [5] that recover 21 "
        "landmarks per hand together with handedness. Working from "
        "landmarks rather than RGB is what makes a 175,389-parameter CPU "
        "model possible: the input collapses from hundreds of thousands "
        "of pixels to 144 numbers per frame, the model becomes invariant "
        "to clothing, lighting and background, and \u2014 decisively for "
        "a hospital \u2014 no camera frame is ever persisted."))
    c.append(h2("Sequence Classification"))
    c.append(body(
        "A sign is a trajectory, not a posture, so the classifier must "
        "operate over time. Recurrent networks are the classical choice: "
        "the long short-term memory unit [6] and the gated recurrent "
        "unit [7] are the two standard cells, and bidirectionality lets a "
        "timestep be scored with both its past and its future. Attention "
        "over time [8], [9] generalises the idea by learning which "
        "timesteps deserve weight rather than committing to the last "
        "hidden state. Our model combines the two in the cheapest "
        "possible way: a two-layer bidirectional GRU followed by an "
        "additive attention pool. The motivation is specific \u2014 a "
        "30-frame window necessarily contains preparatory and resting "
        "frames in which nothing is being signed, and a learned attention "
        "pool can discount them, which a last-hidden-state readout cannot "
        "do reliably."))
    return "".join(c)


def sec_method():
    c = [h1("Method")]

    # ---- A. architecture
    c.append(h2("Design Architecture"))
    c.append(body(
        "Mozhi is a single-page application built with React and "
        "TypeScript and served as static files. Four stages sit between "
        "the camera and the counter's reply, and each is a separate "
        "module so that any one of them can be inspected or replaced "
        "independently. The stages are shown in Fig. 1 and walked through "
        "as pseudocode in Section III-B; the remainder of this section "
        "then describes them one at a time in the order data flows."))
    c.append(bullet(
        "Capture. A webcam frame is handed to MediaPipe, which returns "
        "hand and pose landmarks and nothing else."))
    c.append(bullet(
        "Windowing. The segmenter decides whether a sign is in progress, "
        "assembles the last 30 frames into a fixed window, and hands it "
        "to the classifier."))
    c.append(bullet(
        "Classification. The ONNX graph scores the window over 29 "
        "classes; the decision layer decides whether that score may be "
        "believed."))
    c.append(bullet(
        "Output. An accepted gloss is appended to the transcript, drawn "
        "as a caption in one or both languages, spoken aloud, and signed "
        "by the avatar Meenu."))
    c.append(figure(
        FIG1,
        "End-to-end pipeline of the Mozhi counter terminal. Every stage "
        "runs in the browser; no frame and no inference request leaves "
        "the machine."))
    c.append(body(
        "Five screens are exposed: the live counter, the vocabulary "
        "browser, a review screen for inspecting what was recognised, a "
        "settings screen that sets caption and speech language, and an "
        "archive of past sessions. The settings screen is where the "
        "visitor's language is chosen, either by voice or by touch; "
        "selecting a language moves the caption and the speech together "
        "so the two cannot disagree about which language the counter is "
        "running in. The deployed interface is shown in Fig. 2."))
    c.append(body(
        "One distinction is worth stating here, because the interface "
        "shows both numbers. The twenty-nine glosses described in "
        "Section IV-A are the ones the classifier was trained on and the "
        "only ones it can read. The terminal's output side is deliberately "
        "wider: the avatar and the staff composer draw on a larger "
        "written glossary than the recogniser covers, which is why the "
        "vocabulary screen counts more signs than Table III. "
        "Recognition, not output, is the binding constraint."))
    c.append(figure(
        FIG2,
        "The counter interface as deployed. Left: the visitor's live "
        "camera panel and the sentence under construction. Centre: the "
        "running transcript, captioned in English and Tamil. Right: the "
        "avatar Meenu and the language selector through which the "
        "visitor's language is chosen by touch. The image was captured "
        "without a signer present, so the camera panel shows the "
        "browser's synthetic test feed."))

    # ---- B. pseudocode
    c.append(h2("Recognition Algorithm"))
    c.append(body(
        "The algorithm below is the whole live path, from one webcam "
        "frame to one accepted word. It is given before the individual "
        "stages so that the stages can then be read as parts of something "
        "already seen whole. Constants are written as they are pinned in "
        "the engine; each is justified where it is introduced."))
    c.append(algorithm(
        "Algorithm 1 \u2014 Per-frame recognition and the decision layer",
        [
            "Require:  one webcam frame f, a monotonic timestamp now,",
            "          and a window of the last 30 frames of 144 values",
            "",
            " 1  procedure ONFRAME(f, now)",
            " 2      v, hands, person \u2190 MediaPipe(f)",
            " 3      if isHand(v) = false then hands \u2190 false",
            " 4      if not person then",
            " 5          noPerson \u2190 noPerson + 1",
            " 6          if noPerson \u2265 5 then window \u2190 []",
            " 7          return",
            " 8      end if",
            " 9      noPerson \u2190 0",
            "10      motion \u2190 1 if prev = null else norm(v \u2212 prev)",
            "11      prev \u2190 v",
            "12      low \u2190 low + 1 if motion < 0.015 else 0",
            "13      if low \u2265 90 then window \u2190 []; return",
            "14      if not hands then",
            "15          noHand \u2190 noHand + 1 ;  handsRun \u2190 0",
            "16          if noHand \u2265 6 then window \u2190 []",
            "17          return",
            "18      end if",
            "19      noHand \u2190 0  ;  handsRun \u2190 handsRun + 1",
            "20      window.push(v) ; trim(window, 30)",
            "21      if handsRun < 5 then return        # counted, not judged",
            "22      if |window| < 30 then return        # not yet classifiable",
            "23      if inFlight then return             # never queue results",
            "24      top \u2190 ONNX(flatten(window))        # < 1 ms on CPU",
            "25      best \u2190 top[0] ;  fold(top)",
            "26      if best.conf < 0.50 then recent \u2190 []; return",
            "27      recent.append(best) ; drop(recent, older than 600 ms)",
            "28      s \u2190 argmax smooth",
            "29      if s = null or smooth[s] < 0.50 then return",
            "30      if s \u2260 best.label then return      # self-agreement",
            "31      if now \u2212 recent[0].at < 300 then return",
            "32      if agree(recent, best.label) < 0.70 then return",
            "33      if best.label = lastWord and now \u2212 lastAt < 1000",
            "34           then return                   # debounce",
            "35      lastWord \u2190 best.label ;  lastAt \u2190 now ; recent \u2190 []",
            "36      EMIT(best.label)                    # caption, speech,",
            "37                                              # avatar",
            "38  end procedure",
            "",
            "39  procedure FOLD(top)                      # line 25, detail",
            "40      for k in smooth:  smooth[k] \u2190 smooth[k] \u00d7 0.70",
            "41                        drop k if smooth[k] < 1e-4",
            "42      for p in top:     smooth[p.label] \u2190",
            "43                        smooth[p.label] + p.conf \u00d7 0.30",
            "44  end procedure",
        ],
        note="Gates are tested in the order that fails cheapest: presence "
             "and geometry before any inference, then confidence, then "
             "agreement, then depth of evidence, and finally debounce."))

    c.append(body(
        "Three properties of that listing are worth naming. First, the "
        "onset frames of line 21 are pushed into the window but withheld "
        "from judgement: admitting them costs no gate, because the "
        "stability history stays closed and every check below still sees "
        "the frames it did before, and it shortens the wait for a full "
        "window. Second, the span test of line 3 runs before inference at "
        "all, so a detection that is a sliver never reaches a classifier "
        "that would happily name it. Third, the readings pushed in line "
        "27 are recorded before the gates below them are applied; a share "
        "measured only over the readings that already passed would be "
        "100% by construction and would prove nothing."))

    # ---- C. steps 1-2
    c.append(h2("Landmark Extraction and Windowing"))
    c.append(body(
        "Landmarks are extracted by MediaPipe in video mode with a "
        "monotonic timestamp per frame. The delegate is fixed to CPU. "
        "This is a deliberate choice rather than a fallback: the offline "
        "extractor that produced the training data also forces CPU, and "
        "letting the live path run on a different delegate would make it "
        "compute landmarks the model has never seen. Requests are capped "
        "at 640 pixels on the long edge, which is the widest input at "
        "which the measured pipeline still holds a usable frame period."))
    c.append(body(
        "The hand definition is shared by the detector and the engine so "
        "that the two cannot disagree about what a hand is and then "
        "disagree about what was signed. A candidate whose bounding box "
        "spans less than 0.05 of the frame is not a hand at all: it is the "
        "detector inventing one, and the geometry test is what removes "
        "that class of phantom before any classifier sees it. A frame "
        "that passes becomes one 144-value vector, normalised by "
        "re-centring on the shoulder midpoint and scaling by shoulder "
        "width, and is pushed onto a rolling window that holds exactly "
        "the last 30 such vectors."))

    # ---- D. classifier
    c.append(h2("Classifier Design"))
    c.append(body(
        "The classifier maps a (30, 144) window to 29 logits. It is a "
        "two-layer bidirectional GRU with hidden size 64 and dropout "
        "0.35, whose output is pooled over time by a learned attention "
        "readout rather than by taking the final hidden state. Attention "
        "scores each timestep with an additive composition \u2014 a tanh "
        "projection followed by a linear head producing a scalar per "
        "frame \u2014 softmaxes those scores across the window, and "
        "returns the weighted sum of the recurrent states. A final "
        "dropout and linear projection produce the logits. The forward "
        "pass is given as Algorithm 2 and drawn in Fig. 3."))
    c.append(algorithm(
        "Algorithm 2 \u2014 Classifier forward pass",
        [
            "Require:  X, the last 30 frames, each 144 landmark values",
            "",
            " 1  H      \u2190 BiGRU(X)",
            "              # 2 layers, hidden 64, both directions \u2192 30 \u00d7 128",
            " 2  e_t    \u2190 v^T \u00b7 tanh(W \u00b7 h_t + b)",
            "              # W: 128 \u00d7 128, v: 1 \u00d7 128   \u2192 16,512 params",
            " 3  \u03b1      \u2190 softmax(e)        # one weight per frame, sum \u03b1 = 1",
            " 4  z      \u2190 \u03a3_t \u03b1_t \u00b7 h_t   # resting frames get small \u03b1",
            " 5  z      \u2190 dropout(z, p = 0.35)",
            " 6  logits \u2190 W_c \u00b7 z + b_c",
            "              # W_c: 29 \u00d7 128                    \u2192  3,741 params",
            " 7  return softmax(logits)        # 29 glosses",
        ],
        note="Step 4 is the point of the design: a window that is mostly "
             "rest is pooled toward the frames that moved, which a final "
             "hidden state cannot do."))
    c.append(figure(
        FIG3,
        "Classifier architecture. The attention pool replaces a "
        "last-hidden-state readout so that resting frames inside the "
        "window can be discounted."))
    c.append(body(
        "Parameter composition is given in Table I. The recurrent stack "
        "accounts for 88% of the model, which is the expected shape for "
        "this task: the temporal dynamics are what has to be learned, "
        "while the readout is cheap. At 707 kB the graph is small enough "
        "to ship with the page and to evaluate on a laptop CPU without a "
        "warm-up pause."))
    c.append(table(
        "Model composition",
        ["Component", "Shape", "Parameters", "Share"],
        [["BiGRU, 2 layers, bidirectional", "input 144 \u2192 hidden 64 \u00d72",
          "155,136", "88.4%"],
         ["Temporal attention", "128 \u2192 128 \u2192 1", "16,512", "9.4%"],
         ["Classification head", "128 \u2192 29", "3,741", "2.1%"],
         ["Total", "\u2014", "175,389", "100%"]],
        fracs=[0.36, 0.30, 0.19, 0.15],
        note="ONNX export is 707,250 bytes (691 KiB) with input "
             "[1, 30, 144] and output [1, 29]."))

    # ---- E. training
    c.append(h2("Training Procedure"))
    c.append(body(
        "Training uses Adam at a learning rate of 1e-3 with weight decay "
        "1e-4 and cross-entropy loss, batches of 32, for at most 120 "
        "epochs with early stopping after 12 epochs without validation "
        "improvement. The split is stratified over classes. Landmark-space "
        "augmentation is applied on the fly to the training subset only "
        "and never to validation: Gaussian jitter at 0.005, temporal "
        "warping between 0.8\u00d7 and 1.2\u00d7, translation within "
        "\u00b10.02, and scaling between 0.95\u00d7 and 1.05\u00d7. Each "
        "sample receives a random subset rather than the full chain, so "
        "the model sees single corruptions as well as compound ones."))

    # ---- F. decision layer
    c.append(h2("Decision Layer"))
    c.append(body(
        "This is the part of the system that determines whether it is "
        "usable, and it is where isolated-clip accuracy stops being the "
        "relevant number. The classifier produces a distribution on "
        "demand, every frame, whether or not anyone is signing. Something "
        "has to decide when a sign has started, whether the evidence is "
        "stable, and whether it may be written to the transcript. The "
        "ten gates between a raw prediction and an accepted word are "
        "listed in Table II with the value each is pinned to; Algorithm 1 "
        "shows where each of them sits in the frame path."))
    c.append(table(
        "The ten decision gates, in order",
        ["#", "Gate", "Value", "Purpose"],
        [["1", "Person presence", "5 frames",
          "No subject for 5 frames puts the engine idle."],
         ["2", "Hand span", "0.05",
          "Rejects a detection whose bounding box is a sliver \u2014 the "
          "classic phantom that produces a confident word from no hand."],
         ["3", "Hand onset", "5 frames",
          "Five consecutive frames of a valid hand before anything is "
          "judged. Frames are buffered into the window during onset but "
          "not classified."],
         ["4", "Rest detection", "0.015 / 90 frames",
          "Per-frame landmark motion below 0.015 for 90 consecutive "
          "frames ends the utterance \u2014 a signer who stops is "
          "finished, not hesitating."],
         ["5", "Hand loss", "6 frames",
          "Six frames without a hand ends the utterance and clears "
          "state."],
         ["6", "Confidence floor", "0.50",
          "A softmax below 0.50 is discarded rather than shown."],
         ["7", "Stability window", "600 ms",
          "Predictions are accumulated over 600 ms."],
         ["8", "Stability agreement", "0.70 / 300 ms",
          "At least 70% of the window must agree, and stability reads "
          "are throttled to 300 ms apart."],
         ["9", "Score smoothing", "0.70",
          "Exponential smoothing damps single-frame spikes."],
         ["10", "Debounce", "1000 ms",
          "The same gloss cannot be emitted twice within one second."]],
        fracs=[0.07, 0.21, 0.17, 0.55]))
    c.append(body(
        "Gates 2, 3, 6 and 8 are the anti-false-positive gates and are "
        "the ones most likely to be weakened for a demo. Each is reported "
        "with its latency cost in Section V-D so that any such weakening "
        "can be priced rather than discovered later."))

    # ---- G. output
    c.append(h2("Caption and Speech Output"))
    c.append(body(
        "Everything the system produces is written: the caption, the "
        "transcript log, and the reply. Two people at a counter cannot "
        "both rely on reading it, so the log is spoken as well as shown, "
        "using the browser's own speech synthesis [14]. Nothing is "
        "fetched: the synthesiser and its voices are installed with the "
        "browser, and the interface says so rather than implying an "
        "offline synthesiser it does not have."))
    c.append(body(
        "Two rules decide what comes out of the speaker, and both exist "
        "to stop the machine producing nonsense. First, the voice follows "
        "the script the line is written in, not the language setting: a "
        "line the counter could not translate stays English, and English "
        "read by a Tamil voice \u2014 or Tamil read by an English one "
        "\u2014 is noise rather than speech. The script is detected "
        "directly from the Unicode range of the text. Second, when this "
        "machine has no voice for that script, the English fallback is "
        "spoken instead of handing the original to a voice that cannot "
        "pronounce it. Tamil characters read as English letters is worse "
        "than an accented English answer at a window."))
    c.append(body(
        "The caption language and the speech language are one setting "
        "rather than two: choosing English shows English captions in "
        "English speech, choosing Tamil shows a bilingual caption and "
        "speaks Tamil, and the choice can be made by voice or by touch. "
        "Selecting one moves both so they cannot end up disagreeing about "
        "which language the counter is running in."))
    return "".join(c)


def sec_experiment():
    c = [h1("Experimentation")]
    c.append(h2("Dataset Description"))
    c.append(body(
        "The dataset is deliberately small and deliberately closed. It "
        "covers the words a reception counter actually needs, recorded by "
        "three signers, and is stored as landmarks rather than video. "
        "This section states what is in it and how it was collected, so "
        "the results in Section V can be read against the data that "
        "produced them."))

    c.append(h3("Vocabulary"))
    c.append(body(
        "The vocabulary is the 29 glosses listed in Table III. They were "
        "chosen against three constraints: each must be a word a hospital "
        "counter would plausibly say; each must be signable by a "
        "non-expert after one page of instruction; and the set must be "
        "visually separable, meaning that no two glosses should differ "
        "only in a detail that a webcam at a counter distance cannot "
        "resolve. Glosses are stored as written English, so multi-word "
        "entries such as \"thank you\" and \"how much\" are single "
        "classes, not compositions."))
    c.append(table(
        "The 29-gloss reception vocabulary",
        ["Function", "Glosses"],
        [["Greeting and leave-taking",
          "hello, welcome, goodbye, thank you, please, sorry, yes, no, "
          "good, bad"],
         ["Clinical",
          "help, water, food, medicine, hospital, emergency, fever, pain"],
         ["Query", "name, where, when, how much, i dont understand"],
         ["Direction", "come, go, sit, stand, wait, stop"]],
        fracs=[0.30, 0.70],
        note="Every entry is one class. \"thank you\" is signed and "
             "stored as a single gloss."))

    c.append(h3("Signers and Collection"))
    c.append(body(
        "Three signers contributed 1,305 clips in total, 45 per class. "
        "Composition is given in Table IV. Two acquisition paths feed the "
        "same store: a live prompt-and-countdown capture that records "
        "roughly 30 frames per attempt, and a batch extractor that "
        "decodes pre-recorded clips with OpenCV [12]. Both paths run the "
        "identical landmark pipeline, so a clip's provenance does not "
        "change its representation."))
    c.append(table(
        "Dataset composition",
        ["Signer", "Clips", "Share of corpus", "Frames at 30 per clip"],
        [["hritankar", "452", "34.6%", "13,560"],
         ["ayush", "417", "32.0%", "12,510"],
         ["pratham", "436", "33.4%", "13,080"],
         ["Total", "1,305", "100%", "39,150"]],
        fracs=[0.28, 0.18, 0.26, 0.28],
        note="29 classes \u00d7 45 clips = 1,305. Clips per signer differ "
             "because the 45 clips of each class are split unevenly "
             "across signers."))

    c.append(h3("Landmark Representation and Normalisation"))
    c.append(body(
        "Each frame becomes a single float vector of 144 values. Both "
        "hands contribute 21 landmarks \u00d7 3 coordinates = 63 each, "
        "and a six-joint pose subset \u2014 two shoulders, two elbows and "
        "two wrists \u2014 contributes 6 \u00d7 3 = 18, giving "
        "63 + 63 + 18 = 144. The full torso and the face are excluded: "
        "they add dimension without adding evidence, and dropping the "
        "face keeps the stored data free of biometric imagery."))
    c.append(body(
        "MediaPipe reports handedness in its own frame, so the label it "
        "emits is swapped when written: its \"Left\" lands in the "
        "signer's right-hand block. Without this the two hand blocks "
        "would be silently exchanged for one detector and consistent for "
        "the other."))
    c.append(body(
        "Coordinates are then normalised per frame by re-centring on the "
        "midpoint of the two shoulders and scaling by the shoulder "
        "width. This makes the representation invariant to how far the "
        "signer stands from the camera and to where they sit "
        "horizontally in the frame \u2014 exactly the two degrees of "
        "freedom that vary between a lab recording and a hospital "
        "corridor. Frames in which neither shoulder is detected are left "
        "as zero rather than rescaled, so a missing pose cannot be "
        "amplified into a plausible-looking one. A window is the last 30 "
        "normalised frames, stored as a (30, 144) float32 array."))

    c.append(h3("Labels, Split and Privacy"))
    c.append(body(
        "The store holds two things: one .npy array per clip, and a "
        "labels.csv of word, sample identifier and signer. The label file "
        "is the sole authority on what exists \u2014 a stray array on "
        "disk that labels.csv does not name is not part of the dataset "
        "and is not read. A stratified 80/20 split over labels.csv, made "
        "with scikit-learn [11], yields 1,044 training and 261 "
        "validation clips, with every class represented on both sides."))
    c.append(body(
        "The privacy property is architectural rather than procedural. No "
        "raw camera frame is ever written to disk by either acquisition "
        "path; only derived landmark vectors and label metadata persist. "
        "There is therefore no image store to secure, back up or purge, "
        "and a leaked dataset cannot be used to identify a signer."))

    c.append(h2("Experimental Setup"))
    c.append(body(
        "Offline experiments used Python 3.13 with PyTorch [10] 2.10 on "
        "CPU, MediaPipe 1.0.1, ONNX Runtime [13] 1.27 and scikit-learn "
        "[11] for the stratified split. The trained checkpoint was "
        "exported to ONNX and served statically; in the browser it runs "
        "under ONNX Runtime Web in WebAssembly. Live measurement used an "
        "ordinary laptop webcam with no capture card or ring light."))
    c.append(body(
        "Three quantities are reported. Top-1 accuracy is the usual "
        "argmax agreement. Emission rate is the fraction of clips the "
        "deployed decision layer would actually have displayed, requiring "
        "argmax agreement and a confidence at or above the 0.50 floor "
        "\u2014 the difference between the two is the price of the floor. "
        "Latency is wall-clock time from the first frame in which the "
        "signer begins to the moment the accepted word appears on screen, "
        "instrumented in the browser rather than estimated."))
    return "".join(c)


def sec_results():
    c = [h1("Results and Analysis")]
    c.append(h2("Held-Out Accuracy"))
    c.append(body(
        "On the 261-clip stratified validation split the model scores "
        "256 correct, or 98.1%. Per-signer results are given in Table V. "
        "The spread between the best and worst signer is 1.3 percentage "
        "points, which is narrow enough to say the model is not leaning "
        "on one signer's mannerisms, though the absolute level must be "
        "read with Section V-F in mind."))
    c.append(table(
        "Accuracy, by signer, on the held-out split and over the full "
        "corpus",
        ["Signer", "Val clips", "Val correct", "Val acc.",
         "All clips", "All correct", "All acc."],
        [["ayush", "76", "74", "97.4%", "417", "413", "99.0%"],
         ["hritankar", "106", "104", "98.1%", "452", "445", "98.5%"],
         ["pratham", "79", "78", "98.7%", "436", "435", "99.8%"],
         ["All", "261", "256", "98.1%", "1,305", "1,293", "99.1%"]],
        fracs=[0.22, 0.12, 0.14, 0.12, 0.12, 0.14, 0.14],
        note="The validation split contains only clips the model was not "
             "trained on but does contain signers that were. \"All "
             "clips\" includes training clips and is therefore reported "
             "as an in-sample figure."))

    c.append(h2("Emission Rate and the Cost of the Floor"))
    c.append(body(
        "Over the full corpus the argmax is correct on 1,293 of 1,305 "
        "clips (99.08%). Requiring the confidence floor as well \u2014 "
        "that is, asking what the deployed terminal would actually have "
        "shown \u2014 gives 1,291 (98.93%). The floor therefore costs "
        "0.15 percentage points, on two clips: one go at 0.350 and one "
        "i dont understand at 0.444. Both were classified correctly and "
        "both were suppressed. That is the intended behaviour: a word "
        "the terminal declines to emit is a retry, whereas a word it "
        "emits wrongly is an incident. The floor is doing its job at a "
        "known and measured price."))

    c.append(h2("Error Analysis"))
    c.append(body(
        "Twenty of the 29 classes are perfect over the corpus. The twelve "
        "errors are listed in Table VI, and they are not distributed at "
        "random: they form one dense neighbourhood plus two isolated "
        "pairs."))
    c.append(table(
        "All twelve corpus errors, as true \u2192 predicted",
        ["True gloss", "Predicted gloss", "Count",
         "Mean conf. of true class"],
        [["food", "thank you", "2", "0.916"],
         ["food", "medicine", "1", "0.916"],
         ["please", "food", "1", "0.907"],
         ["please", "medicine", "1", "0.907"],
         ["sorry", "food", "1", "0.926"],
         ["medicine", "sorry", "1", "0.902"],
         ["good", "sorry", "1", "0.949"],
         ["hello", "goodbye", "1", "0.959"],
         ["pain", "goodbye", "1", "0.959"],
         ["name", "please", "1", "0.970"],
         ["i dont understand", "no", "1", "0.846"]],
        fracs=[0.32, 0.26, 0.12, 0.30],
        note="food \u2192 thank you occurs twice, so eleven distinct "
             "clips carry twelve errors."))
    c.append(body(
        "The dominant cluster is food, please, sorry and medicine, which "
        "exchange votes among themselves and account for seven of the "
        "twelve. These four are semantically related at a counter and, "
        "more importantly, share handshapes in the region of the torso "
        "the pose subset is coarsest about. The remaining five are "
        "scattered rather than clustered: hello \u2192 goodbye and "
        "pain \u2192 goodbye are both signs that move outward from the "
        "body, good \u2192 sorry and name \u2192 please each cost a "
        "single clip, and i dont understand \u2192 no is a single-head-"
        "shape confusion."))
    c.append(body(
        "The practical consequence is that a sentence should not be built "
        "from two words that steal from each other. food and thank you "
        "appearing in one utterance is fine because thank you itself is "
        "never misread; food and medicine in the same utterance is not, "
        "because the first can be replaced by the second. Mean "
        "confidence is a poor guide to this \u2014 i dont understand has "
        "the lowest mean confidence at 0.846 but errs once in 45, while "
        "food at 0.916 errs three times. Confidence measures how sure "
        "the model is, not whether it is right."))

    c.append(h2("Runtime and Latency"))
    c.append(body(
        "Landmark extraction dominates the budget and inference does not "
        "appear in it. Measured on CPU at 640 pixels wide, MediaPipe with "
        "both hands and pose costs 34.1 ms per frame, or 29 fps; on a "
        "loaded machine the same run degrades to 48.4 ms, or 21 fps. ONNX "
        "inference on the 30-frame window is below one millisecond. "
        "Extraction is also the stage that can fail: a hand is present in "
        "92.7% of signing frames and pose in 100%, but both hands are "
        "present in only 69.3% of them \u2014 so roughly a third of "
        "signing frames reach the classifier with a hand missing, which "
        "is precisely what the hand-loss and hand-onset gates exist to "
        "absorb."))
    c.append(body(
        "The latency budget is given in Table VII. The first word reaches "
        "the screen 1.29 s after the signer begins. About a second of "
        "that is structural: the classifier needs 30 frames before it has "
        "anything to classify, and 30 frames at 34\u201348 ms is "
        "1.0\u20131.4 s. This is not a parameter that can be tuned, "
        "because 30 is baked into the ONNX input shape [1, 30, 144]; "
        "shrinking it would require retraining, and the model was not "
        "retrained for this work."))
    c.append(table(
        "Latency budget, first accepted word",
        ["Stage", "Cost", "Note"],
        [["Camera frame period", "34\u201348 ms",
          "Load-dependent; measured, not assumed."],
         ["Landmark extraction", "34.1 ms",
          "MediaPipe, hands and pose, CPU, 640 px."],
         ["Hand onset gate", "absorbed",
          "Five frames of hand presence before anything is judged. Those "
          "frames are buffered into the window rather than discarded, "
          "which is what recovered 132 ms."],
         ["Window fill", "\u22481,020\u20131,440 ms",
          "30 frames \u2014 the structural floor."],
         ["ONNX inference", "<1 ms", "30-frame window, CPU."],
         ["Stability + debounce", "\u2248300\u2013600 ms",
          "600 ms agreement window with reads throttled to 300 ms."],
         ["First word on screen", "1,287 ms",
          "Was 1,419 ms before onset buffering; 132 ms recovered."]],
        fracs=[0.26, 0.17, 0.57]))

    c.append(h2("Suppression of Phantom Predictions"))
    c.append(body(
        "The anti-false-positive gates were treated as a first-class "
        "requirement rather than a tuning afterthought, and none of them "
        "has been relaxed. The span gate is the most consequential and "
        "the least obvious: a wrist-length bounding box returned for a "
        "background edge is a detection MediaPipe will happily label, and "
        "a two-layer GRU trained on real signing will still assign it a "
        "confident class. Rejecting on geometry \u2014 the box must span "
        "at least 0.05 of the frame \u2014 removes that class of phantom "
        "at negligible cost. The onset gate serves the complementary "
        "role: five frames of sustained hand presence before any "
        "classification is judged, so a hand passing through the frame "
        "cannot open an utterance."))
    c.append(body(
        "The skeleton overlay visible to the operator is drawn from the "
        "same landmarks the classifier reads, with pose connections "
        "suppressed below a visibility of 0.5 and a connection drawn "
        "only when both endpoints pass. The overlay therefore reports "
        "what was actually classified rather than a best-guess anatomy, "
        "which matters when an operator is trying to work out why a sign "
        "was not recognised."))

    c.append(h2("Limitations"))
    c.append(body("Four limitations bound these results and should be "
                  "read as part of them."))
    c.append(bullet(
        "The split is by clip, not by signer. All three signers appear "
        "on both sides of the validation split, so 98.1% measures new "
        "performances by known signers. Signer-independent accuracy "
        "would require leave-one-signer-out evaluation, which would "
        "require retraining the model and was not performed. The "
        "comparable figure in the literature for unseen signers is far "
        "lower \u2014 63% on ASL Citizen [2] and 84.2% on PopSign [3] "
        "\u2014 across vastly more classes."))
    c.append(bullet(
        "The validation clips are clean. They are pre-segmented landmark "
        "sequences extracted offline, not frames from a live webcam "
        "chain. Live operation adds hand loss in 30.7% of signing "
        "frames, framing variation, and corridor lighting that no "
        "validation clip contains."))
    c.append(bullet(
        "Three signers, one vocabulary, one site. The vocabulary was "
        "designed for this counter, and no claim is made about signs, "
        "signers or settings outside it."))
    c.append(bullet(
        "Single-window latency is structural. At 1.0\u20131.4 s for "
        "window fill it cannot be reduced without retraining at a "
        "shorter sequence length, and the dataset/model were "
        "deliberately left un-retrained."))
    return "".join(c)


def sec_conclusion():
    c = [h1("Conclusion")]
    c.append(body(
        "Mozhi is a reception terminal rather than a research benchmark, "
        "and it was built around the failure that matters there: saying "
        "something when nothing was signed. The recognition component "
        "\u2014 a 175,389-parameter bidirectional GRU with temporal "
        "attention over 30 frames of 144-dimensional landmark data "
        "\u2014 is deliberately small enough to run in the browser on a "
        "CPU, and scores 98.1% on a stratified held-out split of a "
        "1,305-clip, 29-gloss corpus."))
    c.append(body(
        "The contribution that took the work is the ten gates in front "
        "of it. Confidence floor, hand onset, span geometry, rest "
        "detection, stability agreement, smoothing and debouncing are "
        "all pinned to stated values, each is reported with its measured "
        "cost, and none has been relaxed to improve a demo number. The "
        "result is a terminal that suppresses phantom predictions at a "
        "known price \u2014 0.15 percentage points of emission \u2014 "
        "and whose first word reaches the screen 1.29 s after the signer "
        "begins, of which about a second is the irreducible cost of "
        "having 30 frames to classify at all."))
    c.append(body(
        "Speech follows the caption in both directions: the voice is "
        "chosen by the script a line is written in, so a Tamil line is "
        "spoken by a Tamil voice and an untranslated line stays English "
        "rather than being read aloud in a voice that cannot pronounce "
        "it. The language is selected by voice or by touch and moves "
        "caption and speech together. The most valuable next step is "
        "evaluating signer-independent performance, which needs a "
        "retrained model and would replace the principal caveat with a "
        "measurement."))
    return "".join(c)


REFS = [
    "S. Sharma and S. Singh, \u201cRecognition of Indian sign language "
    "(ISL) using deep learning model,\u201d Wireless Pers. Commun., "
    "vol. 123, no. 1, pp. 671\u2013692, 2022, doi: 10.1007/s11277-021-09152-1.",

    "A. Desai et al., \u201cASL Citizen: A community-sourced dataset for "
    "advancing isolated sign language recognition,\u201d in Proc. Adv. "
    "Neural Inf. Process. Syst. (NeurIPS) Datasets Benchmarks Track, "
    "2023, arXiv:2304.05934.",

    "T. Starner et al., \u201cPopSign ASL v1.0: An isolated American "
    "sign language dataset collected via smartphones,\u201d in Proc. "
    "Adv. Neural Inf. Process. Syst. (NeurIPS) Datasets Benchmarks "
    "Track, 2023, doi: 10.52202/075280-0011.",

    "C. Lugaresi et al., \u201cMediaPipe: A framework for building "
    "perception pipelines,\u201d 2019, arXiv:1906.08172.",

    "F. Zhang et al., \u201cMediaPipe hands: On-device real-time hand "
    "tracking,\u201d 2020, arXiv:2006.10214.",

    "S. Hochreiter and J. Schmidhuber, \u201cLong short-term memory,\u201d "
    "Neural Comput., vol. 9, no. 8, pp. 1735\u20131780, 1997, doi: "
    "10.1162/neco.1997.9.8.1735.",

    "K. Cho et al., \u201cLearning phrase representations using RNN "
    "encoder\u2013decoder for statistical machine translation,\u201d in "
    "Proc. Conf. Empirical Methods Natural Language Process. (EMNLP), "
    "2014, pp. 1724\u20131734, doi: 10.3115/v1/D14-1179.",

    "D. Bahdanau, K. Cho, and Y. Bengio, \u201cNeural machine "
    "translation by jointly learning to align and translate,\u201d in "
    "Proc. Int. Conf. Learn. Represent. (ICLR), 2015.",

    "A. Vaswani et al., \u201cAttention is all you need,\u201d in Proc. "
    "Adv. Neural Inf. Process. Syst. (NeurIPS), 2017, pp. "
    "5998\u20136008.",

    "A. Paszke et al., \u201cPyTorch: An imperative style, "
    "high-performance deep learning library,\u201d in Proc. Adv. Neural "
    "Inf. Process. Syst. (NeurIPS), 2019, pp. 8024\u20138035.",

    "F. Pedregosa et al., \u201cScikit-learn: Machine learning in "
    "Python,\u201d J. Mach. Learn. Res., vol. 12, pp. 2825\u20132830, "
    "2011.",

    "G. Bradski, \u201cThe OpenCV library,\u201d Dr. Dobb's J. Softw. "
    "Tools, vol. 25, no. 11, pp. 120\u2013125, 2000.",

    "ONNX Runtime. [Online]. Available: https://onnxruntime.ai",

    "W3C, \u201cWeb Speech API,\u201d Draft Community Group Report. "
    "[Online]. Available: https://webaudio.github.io/web-speech-api/",
]


def sec_references():
    return h1("References") + "".join(ref(t) for t in REFS)


# ================================================================== BUILD
def main():
    if not all(os.path.exists(p) for p in (FIG1, FIG2, FIG3)):
        print("figures missing - run recover.py first")
        return 1

    zin = zipfile.ZipFile(TPL)
    doc = zin.read("word/document.xml").decode("utf-8")

    m = re.match(r"(<\?xml[^>]*\?>)\s*(<w:document\b[^>]*>)", doc)
    if not m:
        print("could not find the document.xml prologue")
        return 1
    decl, open_tag = m.group(1), m.group(2)

    root = ET.fromstring(doc)
    W = root.tag.split("}")[0] + "}"
    bnode = root.find(W + "body")
    sect_final = bnode.find(W + "sectPr")
    if sect_final is None:
        print("no body-level section properties")
        return 1

    # Everything is one column, so only the body-level sectPr survives.
    # The template parks a two-column break inside a paragraph; that
    # paragraph is dropped with the rest of the guidance body. Carry over
    # any header/footer reference so page furniture is not lost with it.
    for sp in root.iter(W + "sectPr"):
        if sp is sect_final:
            continue
        for tag in ("footerReference", "headerReference"):
            for refel in list(sp.findall(W + tag)):
                if sect_final.find(W + tag) is None:
                    sect_final.insert(0, refel)
    final_xml = ET.tostring(sect_final, encoding="unicode")
    # ET serialises with its own ns0: prefix; put it back to w: so it
    # matches the rest of the file.
    final_xml = final_xml.replace("ns0:", "w:")

    new_body = "".join([
        front_matter(),
        sec_intro(),
        sec_related(),
        sec_method(),
        sec_experiment(),
        sec_results(),
        sec_conclusion(),
        sec_references(),
    ])

    out = "%s%s<w:body>%s%s</w:body>%s</w:document>" % (
        decl, open_tag, new_body, final_xml, "")

    # ---- write the package ------------------------------------------------
    types = zin.read("[Content_Types].xml").decode("utf-8")
    if 'Extension="png"' not in types:
        types = types.replace(
            "</Types>",
            '<Default Extension="png" ContentType="image/png"/></Types>', 1)

    rels = zin.read("word/_rels/document.xml.rels").decode("utf-8")
    if IMAGES:
        add = "".join(
            '<Relationship Id="%s" Type="%s" Target="media/%s"/>'
            % (rid, IMG_REL, name) for name, _src, rid in IMAGES)
        rels = rels.replace("</Relationships>", add + "</Relationships>", 1)

    tmp = OUT + ".tmp"
    if os.path.exists(tmp):
        os.remove(tmp)
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zo:
        for item in zin.infolist():
            data = zin.read(item.filename)
            if item.filename == "word/document.xml":
                data = out.encode("utf-8")
            elif item.filename == "[Content_Types].xml":
                data = types.encode("utf-8")
            elif item.filename == "word/_rels/document.xml.rels":
                data = rels.encode("utf-8")
            zo.writestr(item, data)
        for name, spath, _rid in IMAGES:
            with open(spath, "rb") as fh:
                zo.writestr("word/media/" + name, fh.read())
    zin.close()

    if os.path.exists(OUT):
        os.remove(OUT)
    shutil.move(tmp, OUT)

    z2 = zipfile.ZipFile(OUT)
    d2 = z2.read("word/document.xml").decode("utf-8")
    print("wrote %s" % OUT)
    print("  bytes       : %d" % os.path.getsize(OUT))
    print("  ns0 left    : %d" % d2.count("ns0:"))
    print("  paragraphs  : %d" % (d2.count("<w:p>") + d2.count("<w:p ")))
    print("  tables      : %d" % d2.count("<w:tbl>"))
    print("  figures     : %d" % len(IMAGES))
    print("  references  : %d" % d2.count('w:val="references"'))
    print("  H1 / H2 / H3: %d / %d / %d"
          % (d2.count('w:val="Heading1"'), d2.count('w:val="Heading2"'),
             d2.count('w:val="Heading3"')))
    # A w:cols with no w:num is one column, which is what the template's
    # body-level sectPr carries. Read it rather than assume it.
    cols_m = re.search(r"<w:cols[^>]*w:num=\"(\d+)\"", final_xml)
    print("  body columns: %s" % (cols_m.group(1) if cols_m else "1"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
