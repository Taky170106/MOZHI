from docx import Document
from docx.shared import Pt, Inches, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
import datetime

def set_cell_shading(cell, color_hex):
    tblCell = cell._tc
    pr = tblCell.get_or_add_tcPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:fill'), color_hex)
    shd.set(qn('w:val'), 'clear')
    pr.append(shd)

def add_para(doc, text, size=9.5, color="333333", bold=False, italic=False, align=None, bullet=False):
    p = doc.add_paragraph(style='List Bullet' if bullet else 'Normal')
    if align: p.alignment = align
    r = p.add_run(text)
    r.font.name = 'Calibri'; r.font.size = Pt(size); r.font.color.rgb = RGBColor.from_string(color)
    r.bold = bold; r.italic = italic
    p.paragraph_format.space_after = Pt(3)
    return p

def heading(doc, text, level, size, color="0f0f23", align=None):
    h = doc.add_heading(text, level=level)
    if align: h.alignment = align
    for r in h.runs:
        r.font.name = 'Calibri'; r.font.size = Pt(size); r.font.color.rgb = RGBColor.from_string(color)
    h.paragraph_format.space_before = Pt(12 if level==1 else 8)
    h.paragraph_format.space_after = Pt(4)
    return h

def add_rich(doc, parts, align=None):
    p = doc.add_paragraph()
    if align: p.alignment = align
    for t, fmt in parts:
        r = p.add_run(t)
        r.font.name = 'Calibri'; r.font.size = Pt(fmt.get('size',9.5)); r.font.color.rgb = RGBColor.from_string(fmt.get('color','333333'))
        r.bold = fmt.get('bold', False); r.italic = fmt.get('italic', False)
    p.paragraph_format.space_after = Pt(3)
    return p

# ===== BRIEF DOC =====
doc = Document()
for s in doc.sections:
    s.top_margin = Inches(0.6); s.bottom_margin = Inches(0.6); s.left_margin = Inches(0.8); s.right_margin = Inches(0.8)
doc.styles['Normal'].font.name = 'Calibri'
doc.styles['Normal'].font.size = Pt(10)
doc.styles['Normal'].paragraph_format.space_after = Pt(4)

# Cover
p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER; p.paragraph_format.space_after=Pt(6)
r = p.add_run("MOZHI  ·  மொழி"); r.font.size=Pt(11); r.font.color.rgb=RGBColor.from_string("6c6c8c"); r.font.name='Calibri'; r.bold=True; r.letter_spacing=Pt(2)
t = doc.add_paragraph(); t.alignment=WD_ALIGN_PARAGRAPH.CENTER
r = t.add_run("How I Can Explain This Project"); r.font.size=Pt(22); r.font.color.rgb=RGBColor.from_string("0f0f23"); r.bold=True; r.font.name='Calibri'
p = doc.add_paragraph(); p.alignment=WD_ALIGN_PARAGRAPH.CENTER
r = p.add_run("A 10-minute briefing for evaluation  •  No heavy detail"); r.font.size=Pt(9); r.font.color.rgb=RGBColor.from_string("2b4fd8"); r.italic=True
p = doc.add_paragraph(); p.alignment=WD_ALIGN_PARAGRAPH.CENTER
r = p.add_run("Two-Way Indian Sign Language Counter Terminal"); r.font.size=Pt(11); r.font.color.rgb=RGBColor.from_string("333333"); r.bold=True
p = doc.add_paragraph(); p.alignment=WD_ALIGN_PARAGRAPH.CENTER
r = p.add_run(f"{datetime.date.today().isoformat()}  •  32 words  •  97.9% accuracy  •  http://127.0.0.1:5300/"); r.font.size=Pt(7); r.font.color.rgb=RGBColor.from_string("8a8a9e")
# line
p = doc.add_paragraph(); p.alignment=WD_ALIGN_PARAGRAPH.CENTER; r=p.add_run("─"*60); r.font.size=Pt(5); r.font.color.rgb=RGBColor.from_string("FFD24A")

heading(doc, "1. Start with the problem (30 sec)", 1, 11, "1a1a2e")
add_para(doc, "India has <300 certified ISL interpreters for millions of deaf users. At a police station / hospital / railway counter there is usually no interpreter, so a deaf visitor must write notes or bring a relative — no privacy, no independence. The 2016 Rights of Persons with Disabilities Act already requires accessible communication, but an interpreter at every counter does not scale. A terminal does.", size=9, color="333333")
add_rich(doc, [("Line to say: ", {"bold":True, "color":"2b4fd8", "size":9}), ("\"Most systems let a deaf person be heard, but not hear the reply. Mozhi closes the loop.\"", {"italic":True, "color":"1a1a2e", "size":9})])

heading(doc, "2. What we built (1 min)", 1, 11, "1a1a2e")
add_para(doc, "A counter terminal with two directions, fully offline on the counter's own CPU:", bullet=False)
for b in [
    "Visitor signs → Camera + MediaPipe (543 landmarks → 144) → BiGRU model → text for staff.",
    "Staff type → text reordered to ISL grammar (time front, question word end) → 3D avatar (Meenu) signs back.",
    "No video is stored, no network needed for recognition. One idea (landmarks) serves both directions.",
]:
    add_para(doc, b, size=9, bullet=True, color="222222")
add_para(doc, "Demo flow to show: Landing (Meenu + 6 bubbles) → Counter (camera left, transcript centre, avatar right) → type 'come tomorrow' → avatar signs.", size=8.5, color="5a5a6e", italic=True)

heading(doc, "3. Why it matters (30 sec)", 1, 11, "1a1a2e")
add_para(doc, "Hold is where meaning is read. Most avatars fail because they flow through the peak. Mozhi holds the peak (120-250 ms) and keeps face grammar (raised brow = yes/no, furrowed = wh-, headshake = negation) — a hand-only system would miss the question.", size=9)

heading(doc, "4. What we have now (1 min) — no numbers overload", 1, 11, "1a1a2e")
# small table
tbl = doc.add_table(rows=1, cols=3); tbl.style='Light Grid Accent 1'; tbl.alignment=WD_TABLE_ALIGNMENT.CENTER
for c,t in zip(tbl.rows[0].cells, ["32 words live", "Offline", "Two-way"]):
    c.text=t; 
    for p in c.paragraphs:
        p.alignment=WD_ALIGN_PARAGRAPH.CENTER
        for r in p.runs: r.font.size=Pt(8); r.bold=True; r.font.color.rgb=RGBColor.from_string("ffffff")
    set_cell_shading(c, "1a1a2e")
for row in [["hello … pain + time/today/tomorrow", "ONNX 708k, wasm 11 MB, VRM 15 MB", "Visitor→text + Staff→Meenu"], ["97.9% on 290 val, ~15 sec quick train", "Runs at http://127.0.0.1:5300/", "Engine at /#/engine for monitoring"]]:
    cells = tbl.add_row().cells
    for i,txt in enumerate(row):
        cells[i].text=txt
        for p in cells[i].paragraphs:
            for r in p.runs: r.font.size=Pt(7.5); r.font.color.rgb=RGBColor.from_string("222222")
add_para(doc, "Dataset kept: 1,450 samples (1,305 medical + 84 INCLUDE time/today/tomorrow + 21 hello). Original medical data never deleted, police words are appended.", size=8, color="5a5a6e", italic=True)

heading(doc, "5. How to demo to mam (2 min)", 1, 11, "1a1a2e")
for i, txt in enumerate([
    "Open Landing → point to Meenu + 6 bubbles (both directions, 105 signs, English/Hindi/Tamil, ISL grammar, on-device, stops guessing).",
    "Click Start → Counter → Allow camera → show landmarks overlay → sign 'hello' → transcript shows HELLO.",
    "Staff side: type 'come tomorrow morning' → avatar signs with hold → explain hold matters.",
    "Engine: open /#/engine → show 4 donuts (Accuracy 97.9% etc.), heatmap, attention bars → say 'this is how we know it works'.",
],1):
    add_para(doc, f"Step {i}. {txt}", size=9, color="222222")
add_para(doc, "Close with: 'Next we add police-specific signs (complaint/FIR/theft) the same way — videos → extract → finetune — no rebuild needed.'", size=9, color="2b4fd8", bold=True)

heading(doc, "6. One slide to keep open", 1, 11, "1a1a2e")
add_rich(doc, [("If mam asks 'what is new?' → ", {"bold":True, "color":"1a1a2e", "size":9}), ("\"We started from 29 medical signs 98.9%, appended INCLUDE data (time/today/tomorrow) and finetuned to 32 words 97.9% in 50 sec, shipped as ONNX 708k offline. Existing data was kept, new video pipeline is reusable for any police word.\"", {"color":"333333", "size":9})])
add_para(doc, "Keep this doc open, full details are in the second file.", size=8, color="8a8a9e", italic=True)

doc.save("D:/VIT/FALL26/NLP_NEW/sanket/MOZHI_Brief_for_Mam.docx")
print("Brief saved")

# ===== FULL DOC =====
doc = Document()
for s in doc.sections:
    s.top_margin = Inches(0.5); s.bottom_margin = Inches(0.5); s.left_margin = Inches(0.7); s.right_margin = Inches(0.7)
doc.styles['Normal'].font.name = 'Calibri'
doc.styles['Normal'].font.size = Pt(8.5)
doc.styles['Normal'].paragraph_format.space_after = Pt(3)

# Cover
p = doc.add_paragraph(); p.alignment=WD_ALIGN_PARAGRAPH.CENTER
r=p.add_run("MOZHI  ·  மொழி"); r.font.size=Pt(11); r.font.color.rgb=RGBColor.from_string("6c6c8c"); r.bold=True; r.letter_spacing=Pt(2)
t = doc.add_paragraph(); t.alignment=WD_ALIGN_PARAGRAPH.CENTER; r=t.add_run("Complete System, Project & Dataset Documentation"); r.font.size=Pt(20); r.font.color.rgb=RGBColor.from_string("0f0f23"); r.bold=True
p = doc.add_paragraph(); p.alignment=WD_ALIGN_PARAGRAPH.CENTER; r=p.add_run("Everything  •  Architecture, 14-Step ML Pipeline, Data, Model, Metrics, Deployment, Dashboard"); r.font.size=Pt(9); r.font.color.rgb=RGBColor.from_string("2b4fd8"); r.italic=True
p = doc.add_paragraph(); p.alignment=WD_ALIGN_PARAGRAPH.CENTER; r=p.add_run(f"{datetime.date.today().isoformat()}  •  32 words (1,450 samples)  •  97.9% 284/290  •  175,776 params  •  ONNX 708k"); r.font.size=Pt(7); r.font.color.rgb=RGBColor.from_string("8a8a9e")
p = doc.add_paragraph(); p.alignment=WD_ALIGN_PARAGRAPH.CENTER; r=p.add_run("─"*70); r.font.size=Pt(5); r.font.color.rgb=RGBColor.from_string("FFD24A")

# TOC placeholder
heading(doc, "Contents", 1, 10, "1a1a2e")
for t in ["1 Project Overview", "2 System Architecture (Front + Back + Data Flow)", "3 Dataset (Local + INCLUDE + Police)", "4 14-Step ML Pipeline (Each Step Mapped)", "5 Model (BiGRU + Attention)", "6 Training & Finetune", "7 Metrics (Accuracy, F1, Prec/Rec, Conf, Per-Class, Heatmap, Attention)", "8 Deployment (ONNX, Vite, Cache)", "9 Dashboard (User + Engine)", "10 File Map & How to Run"]:
    add_para(doc, t, size=8.5, color="333333")

heading(doc, "1. Project Overview", 1, 11, "1a1a2e")
add_para(doc, "Mozhi is a two-way ISL terminal for public counters (police station chosen). Visitor signs → text, staff type → avatar Meenu signs ISL. One landmark representation (543→144) serves both. Fully offline, CPU-only, no video stored. Covers polytechnic evaluation: interprets without human interpreter, privacy-preserving.", size=8.5)
tbl = doc.add_table(rows=1, cols=4); tbl.style='Light Grid Accent 1'; tbl.alignment=WD_TABLE_ALIGNMENT.CENTER
for c,t in zip(tbl.rows[0].cells, ["32 words", "1,450 samples", "97.9%", "708k ONNX"]):
    c.text=t
    for p in c.paragraphs:
        p.alignment=WD_ALIGN_PARAGRAPH.CENTER
        for r in p.runs: r.font.size=Pt(8); r.bold=True; r.font.color.rgb=RGBColor.from_string("ffffff")
    set_cell_shading(c, "1a1a2e")
for row in [["29 medical + time/today/tomorrow", "1305 + 84 INCLUDE (hello 21×2)", "284/290 val, macro F1 0.97", "15 sec quick train"]]:
    cells = tbl.add_row().cells
    for i,txt in enumerate(row):
        cells[i].text=txt
        for p in cells[i].paragraphs:
            for r in p.runs: r.font.size=Pt(7); r.font.color.rgb=RGBColor.from_string("222222")

heading(doc, "2. System Architecture", 1, 11, "1a1a2e")
add_para(doc, "Frontend app/ (React 18, TypeScript, Vite, Tailwind v4, GSAP, Motion, Lenis) + Backend Mozhiv0.1/ (PyTorch) + server/ (Node SQLite transcript + engine.mjs SSE 5304).", size=8.5, bold=True)
add_para(doc, "Sign→Text: Webcam → MediaPipe Holistic (hand_landmarker.task 7.8M + pose 5.7M) 543 pts → packFrame 144 (63+63+18) → normalise (shoulder centre/width) → MozhiEngine rolling 30 window every 3rd frame → signPredict ONNX wasm → confidence 0.60 + stability 2 + debounce 1s → mozhiGloss → glossing → transcript (localStorage mozhi.turns.v1).", size=8, color="222222")
add_para(doc, "Text→Sign: Staff text → ISL grammar reorder (time front, wh- end) → lexicon.ts 76 signs (core/question/time/health/counter/action/police) → pose.ts Keyframe per sign (hold 120-250ms, coart 170ms) → SigningAvatar VRM (mozhi-avatar.vrm 15MB) → Three.js.", size=8, color="222222")
add_para(doc, "Landing: ParticleTextEffect + ContainerScroll VaniPanel (Meenu, 6 bubbles) + HeroScrollVideoReveal (mozhi-film.mp4 25.54s trimmed) + CinematicFooter. Counter: CameraField + LandmarkField + Transcript. Engine: KPI donuts/heatmaps/attention + 14-stage pipeline + SSE logs.", size=8, color="333333")

heading(doc, "3. Dataset", 1, 11, "1a1a2e")
add_para(doc, "Local training set D:\\VIT\\FALL26\\NLP_NEW\\mozhi\\Mozhiv0.1\\data\\ 1450× .npy (30,144) float32 17kB each, labels.csv 1450 rows word,sample_id,signer, words.txt 32, classes.json 32, best_model.pth 710k. Per word counts: hello 38 (17 val), thank you 38, time 21 (6 val), today 18 (4 val), tomorrow 17 (3 val), rest 9 each (45 originally).", size=8)
tbl = doc.add_table(rows=1, cols=3); tbl.style='Light Grid Accent 1'; tbl.alignment=WD_TABLE_ALIGNMENT.CENTER
for c,t in zip(tbl.rows[0].cells, ["Stage", "Path", "Count"]):
    c.text=t
    for p in c.paragraphs:
        p.alignment=WD_ALIGN_PARAGRAPH.CENTER
        for r in p.runs: r.font.size=Pt(7); r.bold=True; r.font.color.rgb=RGBColor.from_string("ffffff")
    set_cell_shading(c, "2b4fd8")
for row in [["Raw INCLUDE", "Mozhiv0.1/INCLUDE/ 1120 videos (Greetings/Home/Days_and_Time/Jobs partial/Electronics)", "13 zips 56G total, 12 dl 13.5G"], ["Arranged", "Mozhiv0.1/videos/ hello21 thank_you21 time15 today14 tomorrow14 (85 clips)", "85 clips, 5 words"], ["Extracted", "Mozhiv0.1/data/ hello_e9...npy etc. 84/85 ok (1 skip hands_seen False)", "84 new .npy"], ["Deployed", "app/public/models/mozhi/mozhi-isl.onnx 708k + classes.json 32", "ONNX"]]:
    cells = tbl.add_row().cells
    for i,txt in enumerate(row):
        cells[i].text=txt
        for p in cells[i].paragraphs:
            for r in p.runs: r.font.size=Pt(6.5); r.font.color.rgb=RGBColor.from_string("222222")
add_para(doc, "Original medical 1305 never deleted; police/INCLUDE clips are appended via videos/<word>/ → extract_from_videos.py --add-missing-words → labels.csv + words.txt append-only. Missing words (complaint/fir/theft) need ISLRTC legal dict ~20 clips each.", size=7.5, color="5a5a6e", italic=True)

heading(doc, "4. 14-Step Pipeline (Mapped)", 1, 11, "1a1a2e")
steps = [
    ("1 Problem Def", "Two-way police desk, offline, privacy", "README.md:1, lexicon.ts:3 Domain police", "CPU, offline, 543→144"),
    ("2 Data Collect", "Webcam + MediaPipe → (30,144) .npy + INCLUDE videos", "landmark_utils.py:preprocess, fetch_include.py, extract_from_videos.py:63", "30×144, 45/class"),
    ("3 Data Understand", "263 INCLUDE vs 32 local, signer bias Chennai", "INCLUDE_raw/parquet 3816 train, labels.csv", "80/20 split"),
    ("4 Preprocess", "Shoulder centre/width, resample 30, zero-fill", "landmark_utils.py:118, mozhi.ts:48 normalise, mozhi-onnx.ts", "REST 0.015/45"),
    ("5 Feature Eng", "63+63+18=144/frame, NMM brow/mouth", "config.py:60, pose.ts, lexicon.ts:43", "144-d"),
    ("6 Feature Select", "543→144 (drop 468 face + legs)", "mozhi.ts:26 POSE_INDICES 6", "130 attn params"),
    ("7 Split", "Stratified 80/20, augment train only", "dataset.py:205 get_dataloaders", "Train 1160 Val 290"),
    ("8 Model", "BiGRU 2×64 bidir + TemporalAttention", "model.py:68, TemporalAttention 29", "175,776 params"),
    ("9 Training", "Adam 1e-3 CE, head 5 + full 10, early-stop 3/12", "train.py:69, finetune.py:65", "50.2s best 97.9%"),
    ("10 Tuning", "Mirror 0.5, frame-drop 0.3, jitter, warp", "config.py:115, dataset.py:69", "double variety"),
    ("11 Eval", "Confusion 32×32, per-class, top confused", "evaluate.py:71, mozhi-engine.ts:25", "97.9% 284/290"),
    ("12 Explain", "Attention 30 weights + face NMM hold 120-250ms", "model.py:46, README:49", "peak frames 12-18"),
    ("13 Deploy", "ONNX wasm, Vite cache immutable, offline", "export-onnx.py, mozhi-onnx.ts:62, vercel.json", "708k, 691k"),
    ("14 Monitor", "SSE 5304, transcript, drift, finetune", "server/engine.mjs, vite.config 5304", "quick 15 ep"),
]
tbl = doc.add_table(rows=1, cols=4); tbl.style='Light Grid Accent 1'; tbl.alignment=WD_TABLE_ALIGNMENT.CENTER
for c,t in zip(tbl.rows[0].cells, ["Step", "In Mozhi", "Files", "Config"]):
    c.text=t
    for p in c.paragraphs:
        p.alignment=WD_ALIGN_PARAGRAPH.CENTER
        for r in p.runs: r.font.size=Pt(6.5); r.bold=True; r.font.color.rgb=RGBColor.from_string("ffffff")
    set_cell_shading(c, "1a1a2e")
for s in steps:
    cells = tbl.add_row().cells
    for i,txt in enumerate(s):
        cells[i].text=txt
        for p in cells[i].paragraphs:
            for r in p.runs: r.font.size=Pt(6); r.font.name='Consolas' if i>=2 else 'Calibri'; r.font.color.rgb=RGBColor.from_string("222222")

heading(doc, "5. Model", 1, 11, "1a1a2e")
add_para(doc, "ISLClassifier: Input (B,30,144) → BiGRU 2 layers hidden 64 bidirectional (128-d) dropout 0.35 → TemporalAttention: energy=tanh(W·gru) scores=v·energy softmax 30 → weighted sum → Dropout → Linear 128→32 → logits → softmax. 175,776 params (130 attention). CPU-first, MPS optional. Trained originally 29 classes 1305 samples 98.9%, finetuned to 32 classes 1450 samples 97.9% (today/tomorrow limited).", size=8)
add_para(doc, "Packing order is critical: OFF_LEFT 0, OFF_RIGHT 63, OFF_POSE 126; leftHand→RIGHT slot swap deliberate (how model was trained). Absent hand = zeros, normaliser skips all-zero triplets.", size=7.5, color="5a5a6e")

heading(doc, "6. Training & Finetune", 1, 11, "1a1a2e")
add_para(doc, "Finetune 50.2s head 5ep 0.717→0.934 ★, full 10ep 0.962→0.979 ★ best epoch 8, transferred 18 tensors, re-initialised fc. Quick mode 15 ep ~15s (config.MAX_EPOCHS=15 patience 3) vs full 120 ep ~2min, used from Engine Quick train. From-scratch train.py alternative: Adam 1e-3 WD 1e-4 BATCH 32 MAX 120 early 12, ~2 min for 29, ~50s for finetune.", size=8)

heading(doc, "7. Metrics (All Graphical in Engine)", 1, 11, "1a1a2e")
add_para(doc, "Overall: Accuracy 97.9% 284/290, Macro Prec ~0.97 Rec ~0.97 F1 ~0.97 (was 98.9% 0.989/0.988/0.988 on 29). Per-class: 26×100% (9/9), hello 94.1% 16/17, name 88.9% 8/9, today 50% 2/4, tomorrow 33% 1/3 — low due to val 4/3 small split, need 30+ clips each. Confusion: tomorrow→hello 2, today→tomorrow/hello, name→food, hello→today. Confidence: mean 0.984 median 0.997 99.6%≥0.60 threshold 0.60 stability 2 debounce 1s. Params 175,776, Window 30×144, ONNX 708k wasm 11M VRM 15M. All have graphical reps in Engine: 4 donuts, per-class bars, 32×32 heatmap (emerald diag, rose off-diag), 6-bin confidence histogram, F1 29 bars, attention 30 bars + brow/mouth/nod, pipeline 14-node flow.", size=8)
tbl = doc.add_table(rows=1, cols=4); tbl.style='Light Grid Accent 1'; tbl.alignment=WD_TABLE_ALIGNMENT.CENTER
for c,t in zip(tbl.rows[0].cells, ["Accuracy", "F1", "Prec/Rec", "Conf"]):
    c.text=t
    for p in c.paragraphs:
        p.alignment=WD_ALIGN_PARAGRAPH.CENTER
        for r in p.runs: r.font.size=Pt(7); r.bold=True; r.font.color.rgb=RGBColor.from_string("ffffff")
    set_cell_shading(c, "2b4fd8")
cells = tbl.add_row().cells
for i,txt in enumerate(["97.9% 284/290", "0.97 macro (26×1.0, 3×0.94)", "0.97 / 0.97", "mean 0.984 99.6%≥0.60"]):
    cells[i].text=txt
    for p in cells[i].paragraphs:
        p.alignment=WD_ALIGN_PARAGRAPH.CENTER
        for r in p.runs: r.font.size=Pt(7); r.font.color.rgb=RGBColor.from_string("222222")

heading(doc, "8. Deployment", 1, 11, "1a1a2e")
add_para(doc, "tools/export-onnx.py exports best_model.pth → app/public/models/mozhi/mozhi-isl.onnx 708k max softmax diff 3.5e-07, classes.json 32 copied to server/mozhi/. Browser via onnxruntime-web wasm (ort.env.wasm 1 thread, proxy false, wasmPaths absolute). Vite build 3573 modules → dist 1.26M + 1.91M, vercel.json cache wasm/onnx 1y. @mediapipe/tasks-vision 1.0.1 + @tensorflow/tfjs + @pixiv/three-vrm. Offline preview http://127.0.0.1:5300/ (vite preview 5300) proxies /api 5301 /sign 5303 /engine 5304.", size=8)

heading(doc, "9. Dashboard", 1, 11, "1a1a2e")
add_para(doc, "User: Landing (ParticleTextEffect, Meenu VaniPanel with 6 bubbles, mozhi-film.mp4 25.54s pinned, CinematicFooter) → Counter (CameraField + LandmarkField 543 overlay, Transcript centre, Meenu avatar right, threshold linked). Engine (/engine): KPI 6 cards (now 3×2 bigger p-6 min-h 180), Graphical metrics 3-col (donuts + histogram + F1), Per-class bars + confusion canvas, Attention 30 + face NMM, 14-stage pipeline visual (horizontal 14 nodes, active pulse, progress gradient), SSE live logs, settings linked mozhi.settings.v2. Theme tokens.css DotPattern 38 GSAP.", size=8)

heading(doc, "10. File Map & How to Run", 1, 11, "1a1a2e")
add_para(doc, "Run: cd app && npm install && npm run build && npx vite preview --host 127.0.0.1 --port 5300  (+ node server/engine.mjs 5304). Train: cd Mozhiv0.1 && python finetune.py --base best_model.pth --head 5 --full 10. Extract: python extract_from_videos.py --videos ./videos --signer include --add-missing-words. Fetch: python fetch_include.py --include-root ./INCLUDE --out ./videos --words generic_words.txt.", size=7.5, color="222222", bold=False)
tbl = doc.add_table(rows=1, cols=2); tbl.style='Light Grid Accent 1'; tbl.alignment=WD_TABLE_ALIGNMENT.CENTER
for c,t in zip(tbl.rows[0].cells, ["Path", "What"]):
    c.text=t
    for p in c.paragraphs:
        p.alignment=WD_ALIGN_PARAGRAPH.CENTER
        for r in p.runs: r.font.size=Pt(7); r.bold=True; r.font.color.rgb=RGBColor.from_string("ffffff")
    set_cell_shading(c, "1a1a2e")
for row in [["Mozhiv0.1/data/", "1450 .npy + labels.csv + words.txt 32"], ["Mozhiv0.1/INCLUDE/ 1120 videos", "Greetings etc. 12 zips 13.5G"], ["Mozhiv0.1/videos/ 85 clips", "Arranged 5 words"], ["app/public/models/mozhi/", "ONNX 708k classes 32"], ["app/src/pages/Engine.tsx", "Dashboard 27kB"], ["MOZHI_*.docx", "This + brief docs"]]:
    cells = tbl.add_row().cells
    for i,txt in enumerate(row):
        cells[i].text=txt
        for p in cells[i].paragraphs:
            for r in p.runs: r.font.size=Pt(7); r.font.name='Consolas'; r.font.color.rgb=RGBColor.from_string("222222")
add_para(doc, "Existing data never deleted (1,305) — police words are appended (time/today/tomorrow proof). To add complaint/fir/theft collect 20–30 clips each → extract → finetune → export → counter shows new signs via lexicon POLICE pack.", size=7.5, color="2b4fd8", italic=True)

doc.save("D:/VIT/FALL26/NLP_NEW/sanket/MOZHI_Full_Details.docx")
print("Full saved")
