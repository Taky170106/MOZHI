"""
islr.py — the PopSign ASL recogniser, as a local service.

The 1st-place model from Google's Isolated Sign Language Recognition
competition (PopSign ASL, 250 classes, MIT). It cannot run in the browser:
tfjs-tflite loads it and then aborts, because the model's input tensor is
pinned to one frame and that runtime has no way to resize it. LiteRT can,
so the model lives here and the browser talks to it over HTTP.

The division of labour matters. This process never sees the camera. The
browser keeps the webcam and MediaPipe Holistic, cuts a window around each
sign, and posts 543 landmarks per frame — the same coordinates it was
already computing. Nothing here can see the visitor; it only ever receives
numbers.

    python3 islr.py            # serves on 127.0.0.1:5302

    GET  /islr/health          -> {ok, labels, frames_seen}
    POST /islr/predict         binary body: float32[F][543][3], row-major
                               -> {top: [{label, conf}...], ms, frames}

Landmark order within each frame is the competition's own, and getting it
wrong returns confident nonsense rather than an error:

    face        0   – 467      (468)
    left_hand   468 – 488      (21)
    pose        489 – 521      (33)
    right_hand  522 – 542      (21)

Missing landmarks must be NaN, not zero — that is how they appear in the
training data, and zeros put a hand at the origin instead of absent.
"""

import json
import os
import struct
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np
from ai_edge_litert.interpreter import Interpreter

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL = os.path.join(HERE, "models", "popsign", "model.tflite")
LABELS = os.path.join(HERE, "models", "popsign", "sign_to_prediction_index_map.json")

PORT = int(os.environ.get("ISLR_PORT", "5302"))
LANDMARKS = 543
COORDS = 3
MAX_FRAMES = 128          # a sign is never this long; the cap bounds one request
MAX_BODY = MAX_FRAMES * LANDMARKS * COORDS * 4

print(f"loading {MODEL}")
_interpreter = Interpreter(model_path=MODEL)
_runner = _interpreter.get_signature_runner("serving_default")

with open(LABELS) as f:
    _map = json.load(f)
_labels = [None] * len(_map)
for word, idx in _map.items():
    _labels[idx] = word
print(f"{len(_labels)} classes ready")

_seen = 0


def softmax(x):
    """The model emits logits, not probabilities — they sum to about -54.
    Every confidence threshold downstream assumes a probability, so the
    conversion belongs here rather than in three callers."""
    x = x - np.max(x)
    e = np.exp(x)
    return e / e.sum()


def predict(frames: np.ndarray, k: int = 5):
    t0 = time.perf_counter()
    out = _runner(inputs=frames)
    logits = list(out.values())[0].reshape(-1)
    probs = softmax(logits)
    order = np.argsort(probs)[::-1][:k]
    return (
        [{"label": _labels[i], "conf": float(probs[i])} for i in order],
        (time.perf_counter() - t0) * 1000,
    )


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _send(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        # The page is served from the dev server on another port and proxied;
        # a direct hit during debugging should not fail on CORS.
        self.send_header("access-control-allow-origin", "*")
        self.send_header("access-control-allow-headers", "content-type")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self._send(204, {})

    def do_GET(self):
        if self.path.rstrip("/") in ("/islr/health", "/health"):
            self._send(200, {"ok": True, "labels": len(_labels), "frames_seen": _seen})
        else:
            self._send(404, {"error": "not found"})

    def do_POST(self):
        global _seen
        if self.path.rstrip("/") not in ("/islr/predict", "/predict"):
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

        per_frame = LANDMARKS * COORDS * 4
        if len(raw) % per_frame:
            self._send(400, {"error": f"body is not a whole number of {per_frame}-byte frames"})
            return

        frames = len(raw) // per_frame
        if frames == 0:
            self._send(400, {"error": "no frames"})
            return

        try:
            arr = np.frombuffer(raw, dtype="<f4").reshape(frames, LANDMARKS, COORDS)
            top, ms = predict(np.ascontiguousarray(arr, dtype=np.float32))
        except Exception as err:                      # noqa: BLE001 - reported, not raised
            self._send(500, {"error": str(err)})
            return

        _seen += frames
        self._send(200, {"top": top, "ms": round(ms, 2), "frames": frames})

    def log_message(self, fmt, *args):
        # One line per request, without the default's noisy timestamp block.
        print(f"  {self.command} {self.path} — {fmt % args}")


if __name__ == "__main__":
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"islr listening on http://127.0.0.1:{PORT}  (POST /islr/predict)")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")
