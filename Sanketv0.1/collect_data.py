"""
collect_data.py — Standalone OpenCV data-collection script for Sanket ISL.

Usage:
    python collect_data.py                     # default signer "default"
    python collect_data.py --signer alice      # tag samples with signer name

Workflow per word:
    1. Shows the target word on screen.
    2. Press SPACE to start a 3-second countdown.
    3. Records ~30 frames of landmark vectors (via landmark_utils).
    4. Saves each sample as a .npy file + appends a row to labels.csv.

Privacy guarantee: NO raw camera frame or image is ever saved to disk.
Only derived landmark vectors (.npy) and metadata (labels.csv) are persisted.
"""

import argparse
import csv
import os
import time
import uuid

import cv2
import numpy as np

import config
from landmark_utils import LandmarkExtractor, preprocess_sequence


def ensure_data_dir():
    """Create the data directory if it doesn't exist."""
    os.makedirs(config.DATA_DIR, exist_ok=True)


def init_labels_csv():
    """Create labels.csv with a header row if it doesn't already exist."""
    if not config.LABELS_CSV.exists():
        with open(config.LABELS_CSV, "w", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(["word", "sample_id", "signer"])


def count_existing_samples(word: str) -> int:
    """Count how many samples already exist for a given word."""
    if not config.LABELS_CSV.exists():
        return 0
    count = 0
    with open(config.LABELS_CSV, "r") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row["word"] == word:
                count += 1
    return count


def save_sample(sequence: np.ndarray, word: str, signer: str) -> str:
    """
    Preprocess and save a single sample.

    Args:
        sequence: raw landmark frames, shape (T, FEATURE_DIM).
        word:     the target word/sign.
        signer:   identifier for the person signing.

    Returns:
        The sample_id string.
    """
    # Normalise spatially + resample to fixed length
    processed = preprocess_sequence(sequence)

    # Generate a unique sample ID
    sample_id = f"{word}_{uuid.uuid4().hex[:8]}"

    # Save the .npy file (landmark data only — never raw frames)
    npy_path = config.DATA_DIR / f"{sample_id}.npy"
    np.save(npy_path, processed)

    # Append metadata row to labels.csv
    with open(config.LABELS_CSV, "a", newline="") as f:
        writer = csv.writer(f)
        writer.writerow([word, sample_id, signer])

    return sample_id


def draw_status(frame, text: str, color=(0, 255, 0)):
    """Overlay status text on the frame for the live preview."""
    cv2.putText(
        frame, text, (30, 50),
        cv2.FONT_HERSHEY_SIMPLEX, 1.2, color, 2, cv2.LINE_AA,
    )


def run_collection(signer: str):
    """Main data-collection loop."""
    words = config.load_words()
    print(f"[Sanket] Loaded {len(words)} words from {config.WORDS_FILE}")
    print(f"[Sanket] Signer: {signer}")
    print(f"[Sanket] Data directory: {config.DATA_DIR}")
    print()

    ensure_data_dir()
    init_labels_csv()

    extractor = LandmarkExtractor()
    cap = cv2.VideoCapture(0)

    if not cap.isOpened():
        print("[ERROR] Cannot open webcam. Exiting.")
        return

    word_idx = 0

    while word_idx < len(words):
        word = words[word_idx]
        existing = count_existing_samples(word)

        # ── Idle screen: show target word, wait for SPACE ────────────
        while True:
            ret, frame = cap.read()
            if not ret:
                continue

            display = frame.copy()
            draw_status(display, f"Word: {word}  ({existing} samples)", (255, 200, 0))
            cv2.putText(
                display, "SPACE=record  N=next  P=prev  Q=quit",
                (30, 90), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (200, 200, 200), 1,
            )
            cv2.imshow("Sanket — Data Collection", display)

            key = cv2.waitKey(1) & 0xFF
            if key == ord(" "):
                break                  # start recording
            elif key == ord("n"):
                word_idx += 1          # skip to next word
                break
            elif key == ord("p"):
                word_idx = max(0, word_idx - 1)
                break
            elif key == ord("q"):
                print("[Sanket] Quit requested.")
                cap.release()
                cv2.destroyAllWindows()
                extractor.close()
                return

        # If the user pressed N or P, loop around without recording
        if key in (ord("n"), ord("p")):
            continue

        # ── Countdown (3 seconds) ───────────────────────────────────
        for countdown in range(3, 0, -1):
            start = time.time()
            while time.time() - start < 1.0:
                ret, frame = cap.read()
                if not ret:
                    continue
                display = frame.copy()
                draw_status(display, f"Get ready: {countdown}...", (0, 0, 255))
                cv2.imshow("Sanket — Data Collection", display)
                cv2.waitKey(1)

        # ── Record frames ───────────────────────────────────────────
        frames_buffer = []
        target_frames = config.SEQUENCE_LENGTH  # 30

        # Collect a few extra frames so the resampler has material to
        # work with even if a couple are dropped.  We aim for ~35.
        max_frames = target_frames + 5

        print(f"  Recording '{word}' ... ", end="", flush=True)

        while len(frames_buffer) < max_frames:
            ret, frame = cap.read()
            if not ret:
                continue

            # Convert BGR → RGB for MediaPipe
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            vec, _, _ = extractor.extract_frame_vector(rgb)
            frames_buffer.append(vec)

            # Live feedback
            display = frame.copy()
            progress = f"Recording: {len(frames_buffer)}/{max_frames}"
            draw_status(display, progress, (0, 255, 0))
            cv2.imshow("Sanket — Data Collection", display)
            cv2.waitKey(1)

        # Stack into (T, FEATURE_DIM) array
        raw_sequence = np.stack(frames_buffer, axis=0)

        # Save (preprocess_sequence handles normalise + resample)
        sample_id = save_sample(raw_sequence, word, signer)
        existing += 1
        print(f"saved as {sample_id}  (total: {existing})")

    # ── Done ────────────────────────────────────────────────────────
    cap.release()
    cv2.destroyAllWindows()
    extractor.close()
    print("\n[Sanket] Data collection complete.")


# ─────────────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Sanket ISL data collection")
    parser.add_argument(
        "--signer", type=str, default="default",
        help="Name/ID of the person performing the signs (for labels.csv)",
    )
    args = parser.parse_args()
    run_collection(signer=args.signer)
