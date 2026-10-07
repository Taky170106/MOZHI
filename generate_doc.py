from docx import Document
from docx.shared import Pt, Inches, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
import datetime

doc = Document()

# Page margins
for section in doc.sections:
    section.top_margin = Inches(0.7)
    section.bottom_margin = Inches(0.7)
    section.left_margin = Inches(0.8)
    section.right_margin = Inches(0.8)

style = doc.styles['Normal']
style.font.name = 'Calibri'
style.font.size = Pt(9.5)
style.paragraph_format.space_after = Pt(4)

# Helper to set cell shading
def set_cell_shading(cell, color_hex):
    tblCell = cell._tc
    tblCellProperties = tblCell.get_or_add_tcPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:fill'), color_hex)
    shd.set(qn('w:val'), 'clear')
    tblCellProperties.append(shd)

def add_heading_styled(text, level, color="1a1a2e", size=None, align=WD_ALIGN_PARAGRAPH.LEFT):
    h = doc.add_heading(text, level=level)
    h.alignment = align
    for run in h.runs:
        run.font.color.rgb = RGBColor.from_string(color)
        if size:
            run.font.size = Pt(size)
        run.font.name = 'Calibri'
    h.paragraph_format.space_before = Pt(8 if level>1 else 12)
    h.paragraph_format.space_after = Pt(4)
    return h

def add_para(text, bold=False, italic=False, size=9.5, color="333333", bullet=False, align=None):
    p = doc.add_paragraph(style='List Bullet' if bullet else 'Normal')
    if align:
        p.alignment = align
    run = p.add_run(text)
    run.bold = bold
    run.italic = italic
    run.font.size = Pt(size)
    run.font.color.rgb = RGBColor.from_string(color)
    run.font.name = 'Calibri'
    p.paragraph_format.space_after = Pt(2)
    if bullet:
        p.paragraph_format.left_indent = Inches(0.25)
    return p

def add_rich_para(parts, align=None):
    """parts = list of (text, dict(bold, italic, color, size))"""
    p = doc.add_paragraph()
    if align:
        p.alignment = align
    for text, fmt in parts:
        run = p.add_run(text)
        run.font.name = 'Calibri'
        run.font.size = Pt(fmt.get('size', 9.5))
        run.font.color.rgb = RGBColor.from_string(fmt.get('color','333333'))
        if fmt.get('bold'): run.bold = True
        if fmt.get('italic'): run.italic = True
    p.paragraph_format.space_after = Pt(3)
    return p

# ===== COVER =====
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.paragraph_format.space_after = Pt(8)
run = p.add_run("MOZHI  ·  மொழி")
run.font.size = Pt(11)
run.font.color.rgb = RGBColor.from_string("6c6c8c")
run.font.name = 'Calibri'
run.letter_spacing = Pt(2)
run.bold = True

title = doc.add_paragraph()
title.alignment = WD_ALIGN_PARAGRAPH.CENTER
title.paragraph_format.space_after = Pt(6)
run = title.add_run("Two-Way Indian Sign Language\nCounter Terminal")
run.font.size = Pt(26)
run.font.color.rgb = RGBColor.from_string("0f0f23")
run.font.name = 'Calibri'
run.bold = True

# gold line
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
pf = p.paragraph_format
pf.space_after = Pt(12)
run = p.add_run("━" * 42)
run.font.size = Pt(6)
run.font.color.rgb = RGBColor.from_string("FFD24A")

sub = doc.add_paragraph()
sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
sub.paragraph_format.space_after = Pt(4)
run = sub.add_run("End-to-End ML Pipeline  —  14 Steps")
run.font.size = Pt(13)
run.font.color.rgb = RGBColor.from_string("2b4fd8")
run.font.name = 'Calibri'
run.bold = True

desc = doc.add_paragraph()
desc.alignment = WD_ALIGN_PARAGRAPH.CENTER
desc.paragraph_format.space_after = Pt(2)
run = desc.add_run("Updated 32-word model (29 medical + INCLUDE time/today/tomorrow)  •  97.9% 284/290  •  Maps every step to code, config and files")
run.font.size = Pt(9)
run.font.color.rgb = RGBColor.from_string("5a5a6e")
run.font.italic = True

info = doc.add_paragraph()
info.alignment = WD_ALIGN_PARAGRAPH.CENTER
info.paragraph_format.space_after = Pt(16)
run = info.add_run(f"Generated  {datetime.date.today().isoformat()}   •   Mozhiv0.1  +  app   •   http://127.0.0.1:5300/")
run.font.size = Pt(7.5)
run.font.color.rgb = RGBColor.from_string("8a8a9e")

# Info box table
table = doc.add_table(rows=1, cols=3)
table.alignment = WD_TABLE_ALIGNMENT.CENTER
table.autofit = True
hdr_cells = table.rows[0].cells
headers = ["32 WORDS (29 medical + time/today/tomorrow, 1,450 samples)", "144-D FEATURES (30×144)", "~175K PARAMS (BiGRU+Attention)"]
for i, h in enumerate(headers):
    hdr_cells[i].text = h
    for para in hdr_cells[i].paragraphs:
        para.alignment = WD_ALIGN_PARAGRAPH.CENTER
        for run in para.runs:
            run.font.size = Pt(7)
            run.font.color.rgb = RGBColor.from_string("ffffff")
            run.bold = True
    set_cell_shading(hdr_cells[i], "1a1a2e")
    hdr_cells[i].vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER

# Overview paragraph
doc.add_paragraph()  # spacer
add_heading_styled("How to read this document", 1, color="1a1a2e", size=11)
add_para("Each of the 14 canonical ML steps has: a plain definition, what it means in Mozhi, the exact files/lines that implement it, and the current config values. Existing data is kept (Mozhiv0.1/data/*.npy + labels.csv + words.txt) — police signs are appended, never replacing.", size=8.5, color="444444")

# ===== PIPELINE OVERVIEW TABLE =====
add_heading_styled("Pipeline at a glance", 2, color="2b4fd8", size=10)
steps_overview = [
    ("1", "Problem Definition", "Two-way ISL at counters"),
    ("2", "Data Collection", "MediaPipe Holistic -> (30,144) .npy"),
    ("3", "Data Understanding", "263 INCLUDE labels, 29 local classes, signer bias"),
    ("4", "Data Preprocessing", "Shoulder-centre, scale, resample 30"),
    ("5", "Feature Engineering", "2×63 hands + 18 pose = 144/frame"),
    ("6", "Feature Selection", "543 -> 144 (keep 6 pose joints)"),
    ("7", "Train/Val/Test Split", "Stratified 80/20, augment train only"),
    ("8", "Model Selection", "BiGRU 2×64 bidir + temporal attention"),
    ("9", "Model Training", "Adam 1e-3, CE, max 120ep, early-stop 12"),
    ("10", "Hyperparameter Tuning", "LR, dropout 0.35, mirror/frame-drop"),
    ("11", "Model Evaluation", "Val acc ~0.99, conf 0.60, confusion"),
    ("12", "Explainability", "Attention weights + face NMM"),
    ("13", "Deployment", "ONNX + wasm, Vercel/cache, offline"),
    ("14", "Monitoring & Retraining", "Transcript log, proxy 5301/5303, finetune"),
]
t = doc.add_table(rows=1, cols=3)
t.style = 'Light Grid Accent 1'
t.alignment = WD_TABLE_ALIGNMENT.CENTER
hdr = t.rows[0].cells
for i, txt in enumerate(["#", "Step", "Mozhi instantiation"]):
    hdr[i].text = txt
    for para in hdr[i].paragraphs:
        para.alignment = WD_ALIGN_PARAGRAPH.CENTER
        for r in para.runs:
            r.font.size = Pt(7.5)
            r.bold = True
            r.font.color.rgb = RGBColor.from_string("ffffff")
    set_cell_shading(hdr[i], "2b4fd8")
for s in steps_overview:
    row = t.add_row().cells
    row[0].text = s[0]
    row[1].text = s[1]
    row[2].text = s[2]
    for i, c in enumerate(row):
        for para in c.paragraphs:
            para.alignment = WD_ALIGN_PARAGRAPH.CENTER if i==0 else WD_ALIGN_PARAGRAPH.LEFT
            for r in para.runs:
                r.font.size = Pt(7.5)
                r.font.color.rgb = RGBColor.from_string("222222")

# Helper for step sections
def add_step(number, title, definition, mozhi_what, files, config, police_note=None):
    # Step header with colored number
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(10)
    p.paragraph_format.space_after = Pt(2)
    run = p.add_run(f"{number:02d}  —  {title}")
    run.font.size = Pt(11)
    run.font.color.rgb = RGBColor.from_string("0f0f23")
    run.bold = True
    run.font.name = 'Calibri'
    # underline gold
    p2 = doc.add_paragraph()
    p2.paragraph_format.space_after = Pt(4)
    run = p2.add_run("─" * 88)
    run.font.size = Pt(4)
    run.font.color.rgb = RGBColor.from_string("FFD24A")

    # Definition box
    add_rich_para([("Definition: ", {"bold": True, "color": "2b4fd8", "size": 8.5}),
                   (definition, {"color": "222222", "size": 8.5})])
    add_rich_para([("In Mozhi: ", {"bold": True, "color": "c2334b", "size": 8.5}),
                   (mozhi_what, {"color": "333333", "size": 8.5})])

    # Two-column table: Files & Config
    t = doc.add_table(rows=1, cols=2)
    t.style = 'Light Grid Accent 1'
    hdr = t.rows[0].cells
    hdr[0].text = "Files / Lines"
    hdr[1].text = "Config / Current values"
    for c in hdr:
        for para in c.paragraphs:
            para.alignment = WD_ALIGN_PARAGRAPH.CENTER
            for r in para.runs:
                r.font.size = Pt(7)
                r.bold = True
                r.font.color.rgb = RGBColor.from_string("ffffff")
        set_cell_shading(c, "1a1a2e")
    row = t.add_row().cells
    # Files - preserve line breaks
    row[0].text = files
    for para in row[0].paragraphs:
        for r in para.runs:
            r.font.size = Pt(6.8)
            r.font.name = 'Consolas'
            r.font.color.rgb = RGBColor.from_string("1a1a2e")
    row[0].paragraphs[0].paragraph_format.space_after = Pt(1)
    row[1].text = config
    for para in row[1].paragraphs:
        for r in para.runs:
            r.font.size = Pt(6.8)
            r.font.name = 'Consolas'
            r.font.color.rgb = RGBColor.from_string("1a1a2e")
    if police_note:
        add_rich_para([("Police append: ", {"bold": True, "color": "17a0b4", "size": 7.5}),
                       (police_note, {"color": "333333", "size": 7.5})])
        doc.add_paragraph().paragraph_format.space_after = Pt(2)

# ===== ALL 14 STEPS =====
add_step(1, "Problem Definition",
    "State the business problem, target users, success criteria and constraints before any data or model choice. Answers: who benefits, what is predicted, and how success is measured.",
    "Two-way ISL at public counters (police station chosen). Deaf visitor signs -> text for staff; staff type -> avatar signs back in ISL. Must run offline on the counter's own CPU, no video stored, privacy-preserving. Success = understandable exchange without interpreter. Rights of Persons with Disabilities Act, 2016 is the compliance driver.",
    "README.md:1-28\napp/src/lib/lexicon.ts:3 Domain='police'\napp/src/components/ui/vani-stage.tsx:38 6 bubbles\npaper/mozhi_ieee.tex:36 police station counter",
    "Domains: core/question/time/health/counter/travel/action/police\nConstraints: CPU-only, offline, 543->144, <10 min train",
    "Keep 29 medical signs that already cover desk (help, emergency, name, where...); police terms (complaint, FIR, theft) are appended as new classes, never overwriting.")

add_step(2, "Data Collection",
    "Gather raw observations that represent the real task. Record how data is captured (sensor, rate, labels), quality controls, and storage format.",
    "Each sample = one sign performance: webcam -> MediaPipe Holistic -> raw (T,144) -> preprocess -> (30,144) float32 saved as Mozhiv0.1/data/<word>_<hash>.npy; row in data/labels.csv (word,sample_id,signer); word list in words.txt (29). Same path is reused for open-source video clips via extract_from_videos.py.",
    "Mozhiv0.1/landmark_utils.py:preprocess_sequence\nMozhiv0.1/data/labels.csv\nMozhiv0.1/extract_from_videos.py:63 extract_clip\nMozhiv0.1/fetch_include.py (INCLUDE/CISLR)\napp/src/lib/mozhi.ts:48 writeHand",
    "SEQUENCE_LENGTH=30\nFEATURE_DIM=144 (63+63+18)\nHAND_COORDS=63, POSE_COORDS=18\nsamples ~1,305, 45/class",
    "New police clips -> videos/<word>/*.mp4 -> extract --add-missing-words appends to labels.csv + words.txt; original .npy kept.")

add_step(3, "Data Understanding / Exploration",
    "Explore distributions, class balance, missing data, correlations and biases before modeling. Visualize counts, signer/style variation, and overlaps with available corpora.",
    "Medical corpus: 29 words (hello, thank you, please ... fever, pain), ~45 each, single-location signer bias (Chennai ISL note in INCLUDE README). INCLUDE has 263 labels across 15 parents; only ~10 overlap with police-generic (hello, thank you, police, time, today...). Missing police-specific (FIR, complaint, theft) must come from ISLRTC Legal Dictionary or self-record. Stratified split avoids leap distribution.",
    "INCLUDE_raw/data/train-00000.parquet (3,816 rows)\nMozhiv0.1/data/labels.csv:40k\nconfig.py:load_words()\napp/src/lib/lexicon.ts:28 DOMAINS",
    "VAL_SPLIT=0.20\nunique parents 15, labels 263\ninclude_50 689/3,816",
    "Before appending, list missing words: sorry/yes/no/help/name... NOT in INCLUDE -> need ISLRTC or own clips; cap with --max-per-word 30 to avoid imbalance.")

add_step(4, "Data Preprocessing",
    "Clean and normalize raw data into a consistent numerical form the model can consume: centering, scaling, resampling, handling missing detections.",
    "landmark_utils.preprocess_sequence shoulders-centres (midpoint), scales by shoulder width, resamples to exactly 30 frames via resample_sequence. Missing hands zero-filled; normaliser skips all-zero triplets so they stay absent. Browser mirrors this in mozhi.ts:normalise which mutates a copy before inference. Video-extracted clips follow identical path (import same landmark_utils) so train/infer parity is provable.",
    "Mozhiv0.1/landmark_utils.py:118 detect_for_video\napp/src/lib/mozhi.ts:48-78 writeHand/packFrame\napp/src/lib/mozhi-onnx.ts:normalise\nMozhiv0.1/extract_from_videos.py:142 preprocess_sequence",
    "REST_MOTION_THRESHOLD=0.015\nREST_FRAMES_TO_IDLE=45\nNO_PERSON_FRAMES_TO_IDLE=5\nINFERENCE_EVERY_N_FRAMES=3",
    "Skipped clips logged: <2 frames or hands_seen=False [skip] extract_from_videos.py:91 -> re-encode or re-record.")

add_step(5, "Feature Engineering",
    "Transform cleaned data into informative features that expose the signal. For temporal signals this is per-timestep vectors plus motion cues.",
    "Per frame: left hand 21*3=63 + right hand 63 + 6 pose joints (shoulders/elbows/wrists)*3=18 = 144 floats. Motion is implicit in frame-to-frame L2 deltas; face NMM (brow/mouth/nod/head/torso) are kept as separate avatar channels via pose.ts. No image retained - 'Every frame becomes 543 coordinates. Nothing else is kept.' (Landing).",
    "config.py:60 HAND_LANDMARKS_COUNT 21\nmodel.py:4 Input (B,30,144)\nlexicon.ts:43 nmm/brow/mouth\napp/src/lib/pose.ts",
    "HAND 21, POSE_INDICES [11,12,13,14,15,16]\nFEATURE_DIM 144\nMAX_FRAMES 240, MIN_FRAMES 4",
    "Police pack lexicon already authored with plausible pose tracks (lexicon.ts:709 POLICE etc.) - simulated until fine-tuned, avatar can demo before recogniser catches up.")

add_step(6, "Feature Selection",
    "Choose the subset of features that help most and remove redundancy/noise. Fewer features -> faster, more robust, less overfit.",
    "Holistic gives 543 (33 pose + 468 face + 42 hands) -> keep only 144 that matter for ISL (hands+upper pose). 468 face mesh dropped; lower-body pose dropped. This halves CPU cost and matches the VRM rig which ignores screen roll. Attention will further select frames (step 12).",
    "mozhi.ts:26 POSE_INDICES 6\nconfig.py:64 FEATURE_DIM\nmodel.py:96 BiGRU input_dim=144",
    "Kept: 126 hand + 18 pose =144\nDropped: 399 (face mesh, legs)\nAttention params 130 (selective over 30)",
    "If confusion REPORT vs COMPLAINT persists, can add face NMM as extra 3-5 dims rather than more hand points.")

add_step(7, "Train / Validation / Test Split",
    "Partition data for unbiased training and evaluation. Train fits, val tunes/early-stops, test is held-out final. Stratify to preserve class ratios.",
    "dataset.py:get_dataloaders loads full ISLDataset (no augment), StratifiedShuffleSplit 80/20 random_state 42 -> train indices + val indices -> two dataset instances (train augment=True, val augment=False) -> Subset wrappers -> DataLoader shuffle train True. No leakage because augmentation is train-only.",
    "dataset.py:205 get_dataloaders\nsklearn.model_selection.StratifiedShuffleSplit\ndataset.py:219 labels_array\nconfig.py:111 VAL_SPLIT",
    "BATCH_SIZE 32, VAL_SPLIT 0.20\nTrain ~1,044 / Val ~261 (for 1,305)\nnum_workers 0 (macOS fork safe)",
    "With 10 clips/new class, val gets ~2 samples -> noisy; keep --full-epochs 0 (head-only) and run evaluate.py 3x or hold videos/test/.")

add_step(8, "Model Selection",
    "Choose architecture family suited to data type. For fixed-length temporal coordinates: recurrent / temporal convolutional / transformer. Weigh capacity vs CPU budget.",
    "ISLClassifier: 2-layer BiGRU hidden 64 bidirectional -> output 128-d per timestep -> optional TemporalAttention (Bahdanau, W*energy+v*score -> softmax -> weighted sum) -> Dropout 0.35 -> Linear num_classes. CPU-first, optional MPS. Plain last-state fallback via use_attention=False for A/B.",
    "model.py:29 TemporalAttention\nmodel.py:68 ISLClassifier\nmodel.py:138 build_model\nmodel.py:155 param count log",
    "GRU_HIDDEN 64, LAYERS 2, DROPOUT 0.35\nParams ~175k (~130 attention)\nBiGRU ON, attention ON",
    "Appending 6 police classes -> fc layer re-initialised, backbone kept (finetune.py:76 transfer except fc).")

add_step(9, "Model Training",
    "Fit parameters by minimizing loss. Loop: forward -> loss -> backward -> optimizer step. Track train/val loss & accuracy each epoch.",
    "train.py:train() picks device (MPS if available else CPU), dumps classes.json, Adam weight_decay 1e-4, CrossEntropyLoss, for epoch in 1..120: train phase (zero_grad, logits, loss, backward, step) -> avg train loss/acc; val phase torch.no_grad -> avg val loss/acc -> early-stop on val_acc. Current 29-class -> ~0.99 val in ~2 min.",
    "train.py:55 Adam\ntrain.py:60 CrossEntropyLoss\ntrain.py:69-133 loop\nconfig.py:101 LEARNING_RATE 1e-3",
    "MAX_EPOCHS 120, LR 1e-3, WD 1e-4\nEarlyStop patience 12\nSaves best_model.pth on ★ new best",
    "Pretrain on INCLUDE ~50 classes: python train.py (~5-15 min CPU) -> best_model_pretrained.pth before police fine-tune.")

add_step(10, "Hyperparameter Tuning",
    "Search hyperparameters that control learning (LR, dropout, batch, patience, augmentation probs). Use val accuracy, not train, and early stopping to avoid overfit.",
    "Already tuned: DROPOUT 0.35, LEARNING_RATE 1e-3, BATCH 32, EARLY_STOP 12. Augmentation space: AUGMENT_JITTER_STD 0.005, TIME_WARP 0.8-1.2, TRANSLATE 0.02, SCALE 0.95-1.05, MIRROR_PROB 0.5, FRAME_DROP 0.3 max15% (dataset.py:117 augment). Also INFERENCE thresholds CONF 0.60 STABILITY 2 DEBOUNCE 1.0 for live demo. Fine-tune LRs head 1e-3 full 2e-4 separate.",
    "config.py:115-132 AUGMENT_*\nconfig.py:69 CONF 0.60\nfinetune.py:117 head_lr 1e-3 full_lr 2e-4\ndataset.py:69 _mirror",
    "Mirror is single biggest win (doubles left/right variety free); frame-drop mimics webcam missed detections.",
    "When appending few clips, tune only head LR first; unfreeze backbone only after val stabilises.")

add_step(11, "Model Evaluation",
    "Measure final performance with metrics and error analysis. Confusion matrix, per-class precision/recall, confidence calibration. Compare to baseline and ablations.",
    "evaluate.py reports val accuracy + confusion matrix; realtime_infer.py webcam smoke test. Live thresholds: need 2 stable frames + 0.60 softmax + 1.0s debounce. Check near-confusables: REPORT vs COMPLAINT vs FORM (lexicon near), POLICE vs OFFICER, STATION vs ROOM. Attention-off baseline via train.py --no-attention.",
    "Mozhiv0.1/evaluate.py\nMozhiv0.1/realtime_infer.py\nchecks/model.mjs:67 null class\nconfig.py:69-75 thresholds",
    "29-class ~0.991 val acc, 0.60 still filters noise\nStability 2 (was 3), Debounce 1.0s (was 1.5)",
    "Police new classes: treat per-class acc as noisy if N<30; look at confusion diagonals and whether REPORT confusion drops after adding 30+ complaint clips.")

add_step(12, "Explainability / Interpretation",
    "Explain why the model predicted what it did. For ISL this is temporal attention (which frames mattered) and grammar-level face markers.",
    "TemporalAttention weights (model.py:56 softmax scores) weight active stroke vs rest/transition - can be logged to see if peak-hold is read. Lexicon NMM (brow/mouth/nod/head) in lexicon.ts carries ISL grammar (yes/no raised brow, wh- furrowed, negation headshake). Avatar hold matters: sign phases preparation-stroke-hold-transition - hold is where meaning is read (README). Future: log attention per inference to transcript.",
    "model.py:46 TemporalAttention.forward\nlexicon.ts:43 nmm\nREADME.md:49 hold phase\napp/src/lib/player.ts:hold",
    "Attention negligible 130 params; can disable to test gain. Face track logged alongside hands for demo.",
    "Police demo before training: avatar uses authored Keyframe tracks (lexicon.ts:709) - plausible motion for presentation until recogniser learns real motion.")

add_step(13, "Deployment",
    "Package the trained model for real use: export to runtime format, serve with low latency, cache heavy assets, ensure offline one-origin operation.",
    "tools/export-onnx.py exports best_model.pth -> app/public/models/mozhi/mozhi-isl.onnx (707k) + classes.json copied. Browser runs via onnxruntime-web (mozhi-onnx.ts), MediaPipe wasm vision_wasm_internal.wasm (11MB) served locally. Vite build -> dist, vercel.json caches wasm/onnx/vrm 1y. @mediapipe/tasks-vision 1.0.1 + @tensorflow/tfjs prebundled in vite.config.ts. Counter works unplugged (README).",
    "tools/export-onnx.py\napp/src/lib/mozhi-onnx.ts\napp/src/lib/mozhi.ts:135 mozhiGloss\napp/vite.config.ts:19 optimizeDeps\napp/vercel.json:6 headers",
    "ONNX 707k, hand_landmarker 7.8MB, pose 5.7MB, avatar VRM 15MB\nCopy to server/mozhi/ then export",
    "After police fine-tune: cp best_model.pth classes.json -> server/mozhi/ + app/public/models/mozhi/ -> rebuild; mozhi.ts ALIAS maps stolen/fir/thana synonyms to new IDs automatically.")

add_step(14, "Monitoring & Retraining",
    "Observe live performance, log predictions, detect drift, and retrain when data or performance shifts. Keep feedback loop tight.",
    "Preview on http://127.0.0.1:5300 (vite preview). Server proxies vite.config.ts:34 /api:5301 transcript SQLite, /sign:5303 sign.py, /islr:5302 popsigned. transcript_log.txt logs each exchange. Drift signals: val acc drop, null class reads as sign, repeated 'I don't understand'. Retrain trigger: new police vocab or signer/style shift -> add videos/<word>/, extract, finetune head 15ep + full 25ep (early-stop 12), evaluate, promote.",
    "server/index.mjs\nserver/sign.py:80 signPredict\nMozhiv0.1/finetune.py:65 _load_backbone\nMozhiv0.1/TRAINING_POLICE.md:7 runbook",
    "Backup before retrain: cp best_model.pth *.backup\nFinetune transfers non-fc weights if shape matches (tolerates class count change)",
    "Existing data never deleted - finetune loads Stratified split over combined labels.csv; new words appended once, indices stable.")

# ===== CLOSING NOTE =====
doc.add_paragraph()  # spacer
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
pf = p.paragraph_format
pf.space_before = Pt(12)
pf.space_after = Pt(4)
run = p.add_run("Existing dataset is sacred  —  police signs are appended, not replaced.")
run.font.size = Pt(9)
run.font.color.rgb = RGBColor.from_string("2b4fd8")
run.bold = True
run.italic = True

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
run = p.add_run("Run locally:  cd app && npm run build && npx vite preview --host 127.0.0.1 --port 5300   →   http://127.0.0.1:5300/")
run.font.size = Pt(7)
run.font.color.rgb = RGBColor.from_string("5a5a6e")
run.font.name = 'Consolas'

# Save
out = "D:/VIT/FALL26/NLP_NEW/sanket/MOZHI_ML_PIPELINE_14_STEPS_v2.docx"
doc.save(out)
print(f"Saved to {out}")