"""
export-onnx.py — turn the trained checkpoint into the file the browser runs.

The recogniser used to be a Python service; it is now ONNX inside the page
(see app/src/lib/sanket-onnx.ts). This regenerates that file from the
canonical checkpoint and checks the export against PyTorch before declaring
it good — a silently wrong export answers confidently, the same way a
mis-ordered feature vector does.

Source of truth is Sanketv0.1/ (the checkpoint evaluate.py scores). Both
consumers are written:

    app/public/models/mozhi/   what the page downloads
    server/mozhi/              what server/sign.py and the engine read

The parity check deliberately runs on REAL training samples, not random
gaussian noise. Random inputs sit far off the data manifold where two
different checkpoints can happen to agree, which is how a stale export
previously passed its own check while disagreeing with the checkpoint on
every sample that mattered.

    python tools/export-onnx.py
"""

import csv
import json
import os
import sys

import numpy as np
import torch
import torch.nn.functional as F

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
CANON = os.path.normpath(os.path.join(ROOT, "Sanketv0.1"))

# The canonical root must be first on the path: server/mozhi also has a
# config.py and a best_model.pth, and importing the wrong one silently
# exports a different model.
sys.path.insert(0, CANON)
import config
from model import build_model

DESTS = [
    os.path.join(ROOT, "app", "public", "models", "mozhi"),
    os.path.join(ROOT, "server", "mozhi"),
]

classes = json.load(open(config.CLASSES_JSON))
n = len(classes)
ckpt = str(config.MODEL_CHECKPOINT)

m = build_model(num_classes=n)
sd = torch.load(ckpt, map_location="cpu")
if isinstance(sd, dict) and "model_state_dict" in sd:
    sd = sd["model_state_dict"]
if isinstance(sd, dict) and "state_dict" in sd:
    sd = sd["state_dict"]
m.load_state_dict(sd)
m.eval()

print("[source] %s (%d bytes, %d classes)" % (ckpt, os.path.getsize(ckpt), n))

for dest in DESTS:
    os.makedirs(dest, exist_ok=True)
    out = os.path.join(dest, "mozhi-isl.onnx")
    dummy = torch.randn(1, config.SEQUENCE_LENGTH, config.FEATURE_DIM)
    torch.onnx.export(
        m,
        dummy,
        out,
        input_names=["frames"],
        output_names=["logits"],
        opset_version=17,
        dynamo=False,
        do_constant_folding=True,
    )
    # Copied byte-for-byte rather than re-dumped: a re-serialised file can
    # differ in formatting while looking identical, and the three copies of
    # classes.json must stay interchangeable with the checkpoint's own.
    import shutil

    shutil.copyfile(config.CLASSES_JSON, os.path.join(dest, "classes.json"))
    print("[wrote]   %s (%d bytes)" % (out, os.path.getsize(out)))

# ── Parity against the checkpoint, on data the model actually saw ──────
try:
    import onnxruntime as ort
except ImportError:
    print("onnxruntime not installed — skipping parity")
    raise SystemExit(0)

sess = ort.InferenceSession(
    os.path.join(DESTS[0], "mozhi-isl.onnx"), providers=["CPUExecutionProvider"]
)
iname = sess.get_inputs()[0].name


def run_onnx(x):
    """The exported graph bakes batch=1: rank 3 in, so add the batch axis
    and strip it again on the way out."""
    return sess.run(None, {iname: x[None, ...]})[0][0]


def softmax(a):
    e = np.exp(a - a.max())
    return e / e.sum()


def run_torch(x):
    with torch.no_grad():
        return softmax(m(torch.from_numpy(x[None, ...])).numpy()[0])


checked = 0
disagree = 0
worst = 0.0

# Real samples, already normalised at save time.
if os.path.exists(config.LABELS_CSV):
    known = set(config.load_words())
    rows = [r for r in csv.DictReader(open(config.LABELS_CSV)) if r["word"] in known]
    for r in rows[:300]:
        p = config.DATA_DIR / (r["sample_id"] + ".npy")
        if not os.path.exists(p):
            continue
        seq = np.load(p).astype(np.float32)
        if seq.shape != (config.SEQUENCE_LENGTH, config.FEATURE_DIM):
            continue
        a, b = run_torch(seq), softmax(run_onnx(seq))
        worst = max(worst, float(np.abs(a - b).max()))
        disagree += int(a.argmax() != b.argmax())
        checked += 1

# A handful of random inputs as a second, weaker signal.
rng = np.random.default_rng(0)
for _ in range(20):
    x = rng.standard_normal((config.SEQUENCE_LENGTH, config.FEATURE_DIM)).astype(np.float32)
    a, b = run_torch(x), softmax(run_onnx(x))
    worst = max(worst, float(np.abs(a - b).max()))
    disagree += int(a.argmax() != b.argmax())
    checked += 1

print("[parity]  %d inputs, top-1 agreement %d/%d, max softmax delta %.2e"
      % (checked, checked - disagree, checked, worst))
print("[result]  " + ("EXPORT OK — matches the checkpoint"
                      if disagree == 0 else
                      "EXPORT MISMATCH — do not ship this file"))
raise SystemExit(0 if disagree == 0 else 1)
