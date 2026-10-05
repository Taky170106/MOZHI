"""
config.py — Single source of truth for every shared constant in Sanket.

Import this module everywhere. No magic numbers should be duplicated
across scripts. If you need to tweak a threshold, window size, or path,
do it here once.
"""

import os
from pathlib import Path

# ──────────────────────────────────────────────────────────────────────
# Project root (directory containing this file)
# ──────────────────────────────────────────────────────────────────────
PROJECT_ROOT = Path(os.path.dirname(os.path.abspath(__file__)))

# ──────────────────────────────────────────────────────────────────────
# Vocabulary
# ──────────────────────────────────────────────────────────────────────
WORDS_FILE = PROJECT_ROOT / "words.txt"

def load_words() -> list[str]:
    """Load the word list from words.txt. One word per line, stripped."""
    with open(WORDS_FILE, "r") as f:
        return [line.strip() for line in f if line.strip()]

# ──────────────────────────────────────────────────────────────────────
# Data collection & storage
# ──────────────────────────────────────────────────────────────────────
DATA_DIR = PROJECT_ROOT / "data"               # .npy samples land here
LABELS_CSV = DATA_DIR / "labels.csv"            # word, sample_id, signer
CLASSES_JSON = PROJECT_ROOT / "classes.json"    # index-to-word mapping

# ──────────────────────────────────────────────────────────────────────
# Model checkpoint
# ──────────────────────────────────────────────────────────────────────
MODEL_CHECKPOINT = PROJECT_ROOT / "best_model.pth"

# ──────────────────────────────────────────────────────────────────────
# MediaPipe 1.0 task model bundles (downloaded to models/)
# ──────────────────────────────────────────────────────────────────────
MODELS_DIR = PROJECT_ROOT / "models"
HAND_LANDMARKER_MODEL = MODELS_DIR / "hand_landmarker.task"
POSE_LANDMARKER_MODEL = MODELS_DIR / "pose_landmarker.task"

# ──────────────────────────────────────────────────────────────────────
# Logging / transcript
# ──────────────────────────────────────────────────────────────────────
TRANSCRIPT_LOG = PROJECT_ROOT / "transcript_log.txt"

# ──────────────────────────────────────────────────────────────────────
# Sequence / feature geometry
# ──────────────────────────────────────────────────────────────────────
SEQUENCE_LENGTH = 30          # fixed number of frames per sample

# Per-hand: 21 landmarks × 3 coords = 63
# Two hands: 63 × 2 = 126
# Pose (shoulders, elbows, wrists): 6 landmarks × 3 coords = 18
# Total feature vector per frame:
HAND_LANDMARKS_COUNT = 21
HAND_COORDS = HAND_LANDMARKS_COUNT * 3          # 63
POSE_LANDMARKS_COUNT = 6                         # 2 shoulders + 2 elbows + 2 wrists
POSE_COORDS = POSE_LANDMARKS_COUNT * 3          # 18
FEATURE_DIM = (HAND_COORDS * 2) + POSE_COORDS  # 144

# ──────────────────────────────────────────────────────────────────────
# Inference thresholds
# ──────────────────────────────────────────────────────────────────────
CONFIDENCE_THRESHOLD = 0.50   # minimum softmax confidence to accept
                              # (0.60 rejected real signs held at 45–54%;
                              #  0.50 still filters noise)
STABILITY_COUNT = 2           # consecutive identical predictions needed
                              # (was 3 — too strict for live demo)
DEBOUNCE_WINDOW = 1.0         # seconds before re-emitting the same word
                              # (was 1.5 — faster for back-to-back signs)

# "At rest" detection — if the L2 norm of frame-to-frame landmark
# deltas stays below this threshold for REST_FRAMES_TO_IDLE
# consecutive frames, the person is considered idle (not signing).
REST_MOTION_THRESHOLD = 0.015   # min per-frame L2 delta to count as motion
REST_FRAMES_TO_IDLE = 90        # consecutive low-motion frames → "at rest"
                                # (was 45 — a held sign was wiped mid-stroke)

# "No person" detection — if no upper-body pose is detected for this
# many consecutive frames, the scene is considered empty.
NO_PERSON_FRAMES_TO_IDLE = 5

# A landmarker miss for a frame is a flicker, not the signer vanishing.
# Only a sustained absence of hands clears the window; a single dropped
# frame is survived so the buffer is not rebuilt from zero each time.
HAND_LOSS_FRAMES_TO_IDLE = 6

# ──────────────────────────────────────────────────────────────────────
# Inference loop tuning
# ──────────────────────────────────────────────────────────────────────
INFERENCE_EVERY_N_FRAMES = 1  # classify every frame (was 3 — cadence was
                              # the main source of perceived slowness)

# ──────────────────────────────────────────────────────────────────────
# Model architecture hyper-parameters
# ──────────────────────────────────────────────────────────────────────
GRU_HIDDEN_SIZE = 64
GRU_NUM_LAYERS = 2
DROPOUT_RATE = 0.35

# ──────────────────────────────────────────────────────────────────────
# Training hyper-parameters
# ──────────────────────────────────────────────────────────────────────
LEARNING_RATE = 1e-3
WEIGHT_DECAY = 1e-4
BATCH_SIZE = 32
MAX_EPOCHS = 120
EARLY_STOP_PATIENCE = 12      # epochs without val-acc improvement

# ──────────────────────────────────────────────────────────────────────
# Dataset split
# ──────────────────────────────────────────────────────────────────────
VAL_SPLIT = 0.20              # 80/20 stratified split

# ──────────────────────────────────────────────────────────────────────
# Data augmentation (landmark-space)
# ──────────────────────────────────────────────────────────────────────
AUGMENT_JITTER_STD = 0.005           # Gaussian noise σ
AUGMENT_TIME_WARP_RANGE = (0.8, 1.2) # ±20% temporal stretch
AUGMENT_TRANSLATE_RANGE = 0.02       # small spatial shift
AUGMENT_SCALE_RANGE = (0.95, 1.05)   # small scale jitter

# ──────────────────────────────────────────────────────────────────────
# WebSocket / API
# ──────────────────────────────────────────────────────────────────────
API_HOST = "0.0.0.0"
API_PORT = 8000
