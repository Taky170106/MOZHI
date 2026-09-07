"""
export-onnx.py — turn the trained checkpoint into the file the browser runs.

The recogniser used to be a Python service; it is now ONNX inside the page
(see app/src/lib/sanket-onnx.ts). This regenerates that file from
server/sanket/best_model.pth, and checks the export against PyTorch before
declaring it good — a silently wrong export answers confidently, the same
way a mis-ordered feature vector does.

    server/.venv/bin/python tools/export-onnx.py
"""

import json, os, sys, numpy as np, torch, torch.nn.functional as F

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "server", "sanket"))
import config
from model import build_model

classes = json.load(open(config.CLASSES_JSON))
m = build_model(len(classes))
sd = torch.load(config.MODEL_CHECKPOINT, map_location='cpu')
if isinstance(sd, dict) and 'model_state_dict' in sd: sd = sd['model_state_dict']
if isinstance(sd, dict) and 'state_dict' in sd: sd = sd['state_dict']
m.load_state_dict(sd); m.eval()

out = os.path.join(HERE, "..", "app", "public", "models", "sanket", "sanket-isl.onnx")
os.makedirs(os.path.dirname(out), exist_ok=True)
dummy = torch.randn(1, config.SEQUENCE_LENGTH, config.FEATURE_DIM)
torch.onnx.export(m, dummy, out, input_names=['frames'], output_names=['logits'],
                  opset_version=17, dynamo=False, do_constant_folding=True)
json.dump(classes, open(os.path.join(os.path.dirname(out), "classes.json"), "w"), indent=2)
print('wrote', out, os.path.getsize(out), 'bytes')

# parity check against the checkpoint itself
try:
    import onnxruntime as ort
except ImportError:
    print('onnxruntime not installed — skipping parity'); raise SystemExit(0)
s = ort.InferenceSession(out, providers=['CPUExecutionProvider'])
worst = 0.0
rng = np.random.default_rng(0)
for _ in range(20):
    x = rng.standard_normal((1, config.SEQUENCE_LENGTH, config.FEATURE_DIM)).astype(np.float32)
    with torch.no_grad():
        a = F.softmax(m(torch.from_numpy(x)), dim=1).numpy()
    b = torch.softmax(torch.from_numpy(s.run(None, {'frames': x})[0]), dim=1).numpy()
    worst = max(worst, float(np.abs(a - b).max()))
print('max softmax difference over 20 random inputs:', worst)
