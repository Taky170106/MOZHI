"""
sign.py — Mozhi's own recogniser, as a local service.

The BiGRU with temporal attention trained on our own recorded corpus:
32 ISL signs, 175,776 parameters, 30 frames of 144 landmark coordinates
per sign. This is the model the product is actually for — the PopSign
service next door reads a different language and exists only as a bench.

The division of labour is the same as islr.py, and it is the point. This
process never sees the camera. The browser keeps the webcam and MediaPipe,
cuts a window around each sign, and posts the coordinates it was already
computing. Nothing here can see the visitor; it only ever receives numbers.

    server/.venv/bin/python server/sign.py     # 127.0.0.1:5303

    GET  /sign/health   -> {ok, classes, dim, frames, signs}
    POST /sign/predict  binary body: float32[F][144], row-major
                        -> {top: [{label, conf}...], ms, frames}

The 144 floats per frame are in the order the model was trained on, and
getting it wrong returns confident nonsense rather than an error:

    left hand      0 –  62     21 landmarks × 3
    right hand    63 – 125     21 landmarks × 3
    pose         126 – 143     6 landmarks × 3, in the order
                               shoulders, elbows, wrists (left then right)

A missing hand is ZEROS here, not NaN. That is how the training data
represents an absent hand, and the normaliser explicitly skips all-zero
triplets so they stay absent instead of being dragged to the shoulder
midpoint.

Normalisation and resampling are not reimplemented here: they are imported
from the same landmark_utils.py the model was trained with, so what this
service feeds the model cannot drift from what it learned on.
"""

import json
import os
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
BUNDLE = os.path.join(HERE, "mozhi")
sys.path.insert(0, BUNDLE)

import torch                                     # noqa: E402  after sys.path
import config                                    # noqa: E402
from landmark_utils import preprocess_sequence   # noqa: E402
from model import build_model                    # noqa: E402

PORT = int(os.environ.get("SIGN_PORT", "5303"))
FEATURE_DIM = config.FEATURE_DIM          # 144
SEQUENCE_LENGTH = config.SEQUENCE_LENGTH  # 30

# one request is one sign; the cap only bounds a runaway client
MAX_FRAMES = 240
MAX_BODY = MAX_FRAMES * FEATURE_DIM * 4
MIN_FRAMES = 4

with open(os.path.join(BUNDLE, "classes.json")) as f:
    LABELS = json.load(f)

print(f"loading {os.path.join(BUNDLE, 'best_model.pth')}")
_model = build_model(len(LABELS))
_model.load_state_dict(torch.load(os.path.join(BUNDLE, "best_model.pth"), map_location="cpu"))
_model.eval()
torch.set_num_threads(2)
print(f"{len(LABELS)} classes ready · {SEQUENCE_LENGTH}×{FEATURE_DIM} in")

_seen = 0


def predict(raw: np.ndarray, k: int = 5):
    """raw: (T, 144) as measured. Normalised and resampled to (30, 144) by the
    training code before it reaches the model."""
    t0 = time.perf_counter()
    x = preprocess_sequence(raw)
    with torch.no_grad():
        logits = _model(torch.from_numpy(x).unsqueeze(0).float())
        probs = torch.softmax(logits, dim=1)[0].numpy()
    order = np.argsort(probs)[::-1][:k]
    return (
        [{"label": LABELS[i], "conf": float(probs[i])} for i in order],
        (time.perf_counter() - t0) * 1000,
    )


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _send(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        # Proxied through the dev server; a direct hit while debugging
        # should not fail on CORS.
        self.send_header("access-control-allow-origin", "*")
        self.send_header("access-control-allow-headers", "content-type")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self._send(204, {})

    def do_GET(self):
        if self.path.rstrip("/") in ("/sign/health", "/health"):
            self._send(200, {
                "ok": True,
                "classes": len(LABELS),
                "dim": FEATURE_DIM,
                "frames": SEQUENCE_LENGTH,
                "signs": LABELS,
                "frames_seen": _seen,
            })
        else:
            self._send(404, {"error": "not found"})

    def do_POST(self):
        global _seen
        if self.path.rstrip("/") not in ("/sign/predict", "/predict"):
            self._send(404, {"error": "not found"})
            return

        length = int(self.headers.get("content-length") or 0)
        if length <= 0 or length > MAX_BODY:
            self._send(413, {"error": f"body must be 1..{MAX_BODY} bytes, got {length}"})
            return

        raw = b""
        while len(raw) < length:
            chunk = self.rfile.read(length - len(raw))
            if not chunk:
                break
            raw += chunk

        per_frame = FEATURE_DIM * 4
        if len(raw) % per_frame:
            self._send(400, {"error": f"body is not a whole number of {per_frame}-byte frames"})
            return

        frames = len(raw) // per_frame
        if frames < MIN_FRAMES:
            # Resampling four frames to thirty is interpolation, not evidence.
            self._send(400, {"error": f"need at least {MIN_FRAMES} frames, got {frames}"})
            return

        try:
            arr = np.frombuffer(raw, dtype="<f4").reshape(frames, FEATURE_DIM)
            top, ms = predict(np.ascontiguousarray(arr, dtype=np.float32))
        except Exception as err:              # noqa: BLE001 - reported, not raised
            self._send(500, {"error": str(err)})
            return

        _seen += frames
        self._send(200, {"top": top, "ms": round(ms, 2), "frames": frames})

    def log_message(self, fmt, *args):
        print(f"  {self.command} {self.path} — {fmt % args}")


if __name__ == "__main__":
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"sign listening on http://127.0.0.1:{PORT}  (POST /sign/predict)")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")
