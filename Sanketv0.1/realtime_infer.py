"""
realtime_infer.py — Live ISL inference tester + FastAPI WebSocket endpoint.

Two independent modes (selectable via --mode flag):

    python realtime_infer.py --mode local
        Opens a local OpenCV window with the webcam feed, runs the model
        live, and shows accepted predictions on-screen. Useful for testing
        the pipeline end-to-end without any frontend.

    python realtime_infer.py --mode api
        Starts a FastAPI server with a WebSocket endpoint at /ws.
        Each accepted prediction is pushed as JSON:
            {"word": str, "confidence": float, "timestamp": float}
        The frontend connects here.

Both modes share the exact same inference pipeline (rolling buffer,
confidence gating, stability check, debounce). No raw frames are ever
saved — only accepted phrases are appended to transcript_log.txt.
"""

import argparse
import json
import time
from collections import deque

import cv2
import numpy as np
import torch
import torch.nn.functional as F

import config
from landmark_utils import LandmarkExtractor, preprocess_sequence
from model import build_model


# ──────────────────────────────────────────────────────────────────────
# Inference engine (shared between local and API modes)
# ──────────────────────────────────────────────────────────────────────

class InferenceEngine:
    """
    Encapsulates the full live-inference pipeline:
        - Rolling 30-frame landmark buffer
        - Scene presence check (no person → idle)
        - Motion check (person at rest → idle)
        - Classification every N frames
        - Confidence thresholding (≥0.78)
        - Stability check (same word for 3 consecutive calls)
        - Debounce (don't re-emit same word within 1.5s)
        - Buffer clear when no hands detected
    """

    def __init__(self):
        # Load class mapping
        with open(config.CLASSES_JSON, "r") as f:
            self.classes = json.load(f)

        # Build model and load checkpoint
        self.device = torch.device("cpu")
        self.model = build_model(
            num_classes=len(self.classes),
            use_attention=True,
        ).to(self.device)

        state = torch.load(
            config.MODEL_CHECKPOINT,
            map_location=self.device,
            weights_only=True,
        )
        self.model.load_state_dict(state)
        self.model.eval()
        print(f"[Infer] Model loaded ({len(self.classes)} classes)")

        # Landmark extractor (same as training pipeline)
        self.extractor = LandmarkExtractor()

        # Rolling buffer of raw landmark vectors
        self.buffer: deque = deque(maxlen=config.SEQUENCE_LENGTH)

        # Stability tracking
        self.recent_predictions: list[str] = []  # last N predictions
        self.last_emitted_word: str = ""
        self.last_emitted_time: float = 0.0

        # Frame counter for inference cadence
        self.frame_count: int = 0

        # ── "No person" detection state ─────────────────────────────
        # Counts consecutive frames where no upper-body pose is found.
        self._no_person_streak: int = 0

        # ── "At rest" detection state ───────────────────────────────
        # Stores the previous frame's landmark vector and counts
        # consecutive low-motion frames to detect idle standing.
        self._prev_vec: np.ndarray | None = None
        self._low_motion_streak: int = 0

        # Current scene status string (for UI overlays)
        self.scene_status: str = "Listening..."

    # ────────────────────────────────────────────────────────────────
    #  Core per-frame processing
    # ────────────────────────────────────────────────────────────────
    def process_frame(self, bgr_frame: np.ndarray) -> dict | None:
        """
        Process one BGR frame from the webcam.

        Returns:
            A dict {"word": str, "confidence": float, "timestamp": float}
            if a prediction is accepted, else None.

        Scene edge cases handled:
            1. No person in frame → buffer cleared, no prediction.
            2. Person present but at rest (not signing) → no prediction.
        """
        rgb = cv2.cvtColor(bgr_frame, cv2.COLOR_BGR2RGB)

        # Extract landmarks + check hand presence + person presence
        vec, hands_found, person_present = self.extractor.extract_frame_vector(rgb)

        # ── Edge case 1: No person in frame ─────────────────────────
        if not person_present:
            self._no_person_streak += 1
            if self._no_person_streak >= config.NO_PERSON_FRAMES_TO_IDLE:
                # Scene is empty — reset everything
                self.buffer.clear()
                self.recent_predictions.clear()
                self._prev_vec = None
                self._low_motion_streak = 0
                self.scene_status = "No person detected"
                return None
        else:
            self._no_person_streak = 0

        # ── Edge case 2: Person present but at rest ─────────────────
        # Compare current frame vector to previous frame vector.
        # If the L2 difference is tiny, the person isn't moving.
        if self._prev_vec is not None:
            delta = np.linalg.norm(vec - self._prev_vec)
            if delta < config.REST_MOTION_THRESHOLD:
                self._low_motion_streak += 1
            else:
                self._low_motion_streak = 0
        self._prev_vec = vec.copy()

        if self._low_motion_streak >= config.REST_FRAMES_TO_IDLE:
            # Person is standing still — suppress predictions
            self.buffer.clear()
            self.recent_predictions.clear()
            self.scene_status = "Person at rest"
            return None

        # ── Normal flow: require hands ──────────────────────────────
        if not hands_found:
            # No hands → clear the buffer to avoid stale data
            self.buffer.clear()
            self.recent_predictions.clear()
            self.scene_status = "Listening..."
            return None

        self.scene_status = "Signing..."
        self.buffer.append(vec)
        self.frame_count += 1

        # Don't classify until we have a full buffer
        if len(self.buffer) < config.SEQUENCE_LENGTH:
            return None

        # Only classify every N frames for efficiency
        if self.frame_count % config.INFERENCE_EVERY_N_FRAMES != 0:
            return None

        # ── Run classification ──────────────────────────────────────
        raw_seq = np.stack(list(self.buffer), axis=0)  # (30, 144)
        processed = preprocess_sequence(raw_seq)        # normalise + resample

        x = torch.from_numpy(processed).unsqueeze(0).to(self.device)  # (1, 30, 144)

        with torch.no_grad():
            logits = self.model(x)
            probs = F.softmax(logits, dim=1)
            confidence, pred_idx = probs.max(dim=1)
            confidence = confidence.item()
            pred_word = self.classes[pred_idx.item()]

        # Debug: show every raw prediction in the terminal so the user
        # can see what the model is thinking before gating kicks in.
        print(f"    [{pred_word:12s}  conf={confidence:.3f}  "
              f"buf={len(self.buffer)}/{config.SEQUENCE_LENGTH}  "
              f"stable={len(self.recent_predictions)}/{config.STABILITY_COUNT}]")

        # ── Confidence gate ─────────────────────────────────────────
        if confidence < config.CONFIDENCE_THRESHOLD:
            self.recent_predictions.clear()
            return None

        # ── Stability check ─────────────────────────────────────────
        self.recent_predictions.append(pred_word)
        # Keep only the last STABILITY_COUNT predictions
        if len(self.recent_predictions) > config.STABILITY_COUNT:
            self.recent_predictions = self.recent_predictions[-config.STABILITY_COUNT:]

        # Need STABILITY_COUNT consecutive identical predictions
        if len(self.recent_predictions) < config.STABILITY_COUNT:
            return None
        if len(set(self.recent_predictions)) != 1:
            return None

        # ── Debounce ────────────────────────────────────────────────
        now = time.time()
        if (pred_word == self.last_emitted_word
                and now - self.last_emitted_time < config.DEBOUNCE_WINDOW):
            return None

        # ── Accept the prediction ───────────────────────────────────
        self.last_emitted_word = pred_word
        self.last_emitted_time = now
        self.recent_predictions.clear()

        result = {
            "word": pred_word,
            "confidence": round(confidence, 4),
            "timestamp": round(now, 3),
        }

        # Append to transcript log (never raw frames)
        with open(config.TRANSCRIPT_LOG, "a") as f:
            f.write(f"{result['timestamp']}  {result['word']}  "
                    f"(conf={result['confidence']})\n")

        return result

    def close(self):
        """Release resources."""
        self.extractor.close()


# ──────────────────────────────────────────────────────────────────────
# Mode 1: Local OpenCV test window
# ──────────────────────────────────────────────────────────────────────

def run_local():
    """
    Run the inference engine with a local OpenCV window.
    Shows the webcam feed + the most recent accepted prediction.
    Press Q to quit.
    """
    engine = InferenceEngine()
    cap = cv2.VideoCapture(0)

    if not cap.isOpened():
        print("[ERROR] Cannot open webcam.")
        return

    print("[Local] Running live inference. Press Q to quit.")
    current_display = ""
    display_until = 0.0

    while True:
        ret, frame = cap.read()
        if not ret:
            continue

        result = engine.process_frame(frame)

        if result is not None:
            current_display = f"{result['word']}  ({result['confidence']:.0%})"
            display_until = time.time() + 2.5  # show for 2.5 seconds
            print(f"  → {result['word']}  conf={result['confidence']:.3f}")

        # Overlay text
        display = frame.copy()
        if time.time() < display_until:
            cv2.putText(
                display, current_display, (30, 60),
                cv2.FONT_HERSHEY_SIMPLEX, 1.5, (0, 255, 0), 3, cv2.LINE_AA,
            )
        else:
            # Show scene status (e.g. "No person detected", "Person at rest",
            # "Listening...", "Signing...") to give feedback to the user.
            status_color = {
                "No person detected": (100, 100, 255),   # red-ish
                "Person at rest":     (100, 200, 255),    # orange-ish
                "Listening...":       (180, 180, 180),    # grey
                "Signing...":         (0, 255, 180),      # green
            }.get(engine.scene_status, (180, 180, 180))
            cv2.putText(
                display, engine.scene_status, (30, 60),
                cv2.FONT_HERSHEY_SIMPLEX, 1.0, status_color, 2, cv2.LINE_AA,
            )

        # Show buffer status
        buf_len = len(engine.buffer)
        cv2.putText(
            display, f"Buffer: {buf_len}/{config.SEQUENCE_LENGTH}",
            (30, frame.shape[0] - 20),
            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1,
        )

        cv2.imshow("Sanket — Live Inference", display)

        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    cap.release()
    cv2.destroyAllWindows()
    engine.close()
    print("[Local] Stopped.")


# ──────────────────────────────────────────────────────────────────────
# Mode 2: FastAPI WebSocket server
# ──────────────────────────────────────────────────────────────────────

def run_api():
    """
    Start a FastAPI server with a WebSocket endpoint.

    The server captures from the local webcam, runs the inference
    engine, and pushes accepted predictions to all connected
    WebSocket clients as JSON:
        {"word": str, "confidence": float, "timestamp": float}
    """
    import asyncio
    import threading

    from fastapi import FastAPI, WebSocket, WebSocketDisconnect
    import uvicorn

    app = FastAPI(title="Sanket ISL Inference API")

    # Shared state between the capture thread and WebSocket connections
    connected_clients: list[WebSocket] = []
    engine = InferenceEngine()
    latest_result: dict | None = None
    result_lock = threading.Lock()

    def capture_loop():
        """
        Background thread: reads webcam frames, runs inference,
        and stores accepted results for the WebSocket broadcaster.
        """
        nonlocal latest_result
        cap = cv2.VideoCapture(0)
        if not cap.isOpened():
            print("[API] ERROR: Cannot open webcam.")
            return

        print("[API] Webcam capture loop started.")

        while True:
            ret, frame = cap.read()
            if not ret:
                continue

            result = engine.process_frame(frame)
            if result is not None:
                with result_lock:
                    latest_result = result
                print(f"  → {result['word']}  conf={result['confidence']:.3f}")

        cap.release()

    # Start the capture thread (daemon so it dies with the process)
    capture_thread = threading.Thread(target=capture_loop, daemon=True)
    capture_thread.start()

    @app.websocket("/ws")
    async def websocket_endpoint(ws: WebSocket):
        """
        WebSocket endpoint. Polls for new accepted predictions and
        pushes them to the connected client as JSON.
        """
        nonlocal latest_result
        await ws.accept()
        connected_clients.append(ws)
        print(f"[API] Client connected ({len(connected_clients)} total)")

        last_sent_timestamp = 0.0

        try:
            while True:
                # Check for new results at ~30 Hz
                await asyncio.sleep(0.033)

                with result_lock:
                    result = latest_result

                if result is not None and result["timestamp"] > last_sent_timestamp:
                    await ws.send_json(result)
                    last_sent_timestamp = result["timestamp"]

        except WebSocketDisconnect:
            connected_clients.remove(ws)
            print(f"[API] Client disconnected ({len(connected_clients)} remaining)")

    @app.get("/health")
    async def health():
        """Simple health check endpoint."""
        return {"status": "ok", "classes": engine.classes}

    print(f"[API] Starting server on {config.API_HOST}:{config.API_PORT}")
    print(f"[API] WebSocket endpoint: ws://localhost:{config.API_PORT}/ws")
    print(f"[API] Health check:       http://localhost:{config.API_PORT}/health")

    uvicorn.run(app, host=config.API_HOST, port=config.API_PORT)
    engine.close()


# ──────────────────────────────────────────────────────────────────────
# Entry point
# ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Sanket ISL — Real-time inference",
    )
    parser.add_argument(
        "--mode",
        choices=["local", "api"],
        default="local",
        help="'local' = OpenCV test window, 'api' = FastAPI WebSocket server",
    )
    args = parser.parse_args()

    if args.mode == "local":
        run_local()
    else:
        run_api()
