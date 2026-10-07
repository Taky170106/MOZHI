"""
extract_from_videos.py — turn a folder of labelled video clips into the same
.npy landmark samples collect_data.py produces from a webcam.

This is the bridge for option 4 (transfer learning / pretrained videos): drop
clips from any ISL video dataset — INCLUDE, FDMSE-ISL, your own recordings —
into a folder tree keyed by word, and this extracts the identical 144-float
landmark sequences the model trains on. Because it imports the SAME
landmark_utils as collect_data.py and realtime_infer.py, training-time and
inference-time preprocessing stay provably identical.

Expected input layout (one sub-folder per word; the folder name IS the label):

    videos/
      fever/       clip1.mp4  clip2.mov ...
      medicine/    ...
      help/        ...

The word folders may use spaces or underscores ("thank you" or "thank_you");
underscores are normalised to spaces so they line up with words.txt.

Usage:
    python extract_from_videos.py --videos ./videos --signer include_ds
    python extract_from_videos.py --videos ./videos --add-missing-words
    python extract_from_videos.py --videos ./videos --every 2   # subsample frames

Each clip becomes one sample:
    frames → 144-float vectors → normalise (shoulder-centred) → resample to 30
appended to data/labels.csv and written to data/<word>_<hash>.npy — exactly
what dataset.py / train.py already consume.
"""

import argparse
import csv
import os
import uuid
from pathlib import Path

import cv2
import numpy as np

import config
from landmark_utils import LandmarkExtractor, preprocess_sequence

VIDEO_EXTS = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v"}


def ensure_data_dir():
    os.makedirs(config.DATA_DIR, exist_ok=True)


def init_labels_csv():
    if not config.LABELS_CSV.exists():
        with open(config.LABELS_CSV, "w", newline="") as f:
            csv.writer(f).writerow(["word", "sample_id", "signer"])


def norm_word(folder_name: str) -> str:
    """Folder name → canonical label ('thank_you' → 'thank you')."""
    return folder_name.replace("_", " ").strip().lower()


def extract_clip(extractor: LandmarkExtractor, path: Path, every: int) -> np.ndarray | None:
    """
    Read a video file and return raw (T, FEATURE_DIM) landmark frames, or None
    if the clip could not be read or held no usable frames.
    """
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        print(f"    [skip] cannot open {path.name}")
        return None

    frames: list[np.ndarray] = []
    i = 0
    saw_hands = False
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if every > 1 and (i % every) != 0:
            i += 1
            continue
        i += 1
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        vec, hands, _ = extractor.extract_frame_vector(rgb)
        if hands:
            saw_hands = True
        frames.append(vec)

    cap.release()
    if len(frames) < 2 or not saw_hands:
        print(f"    [skip] {path.name}: {len(frames)} frames, hands_seen={saw_hands}")
        return None
    return np.stack(frames, axis=0)


def main():
    ap = argparse.ArgumentParser(description="Extract landmark samples from labelled videos")
    ap.add_argument("--videos", required=True, help="root folder with one sub-folder per word")
    ap.add_argument("--signer", default="video", help="signer tag written to labels.csv")
    ap.add_argument("--every", type=int, default=1, help="use every Nth frame (subsample fast clips)")
    ap.add_argument("--add-missing-words", action="store_true",
                    help="append any new word labels to words.txt automatically")
    args = ap.parse_args()

    root = Path(args.videos)
    if not root.is_dir():
        raise SystemExit(f"--videos path not found: {root}")

    ensure_data_dir()
    init_labels_csv()

    known = set(config.load_words())
    word_dirs = sorted(p for p in root.iterdir() if p.is_dir())
    if not word_dirs:
        raise SystemExit(f"No word sub-folders inside {root}")

    extractor = LandmarkExtractor()
    new_words: list[str] = []
    total_ok = total_seen = 0

    try:
        for wdir in word_dirs:
            word = norm_word(wdir.name)
            clips = [p for p in sorted(wdir.iterdir()) if p.suffix.lower() in VIDEO_EXTS]
            if not clips:
                continue
            if word not in known:
                if args.add_missing_words:
                    new_words.append(word)
                    known.add(word)
                else:
                    print(f"[WARN] '{word}' not in words.txt — pass --add-missing-words to include it. Skipping.")
                    continue

            print(f"[{word}] {len(clips)} clip(s)")
            for clip in clips:
                total_seen += 1
                raw = extract_clip(extractor, clip, args.every)
                if raw is None:
                    continue
                processed = preprocess_sequence(raw)  # normalise + resample → (30,144)
                sample_id = f"{word.replace(' ', '_')}_{uuid.uuid4().hex[:8]}"
                np.save(config.DATA_DIR / f"{sample_id}.npy", processed)
                with open(config.LABELS_CSV, "a", newline="") as f:
                    csv.writer(f).writerow([word, sample_id, args.signer])
                total_ok += 1
                print(f"    [ok] {clip.name} → {sample_id}.npy")
    finally:
        extractor.close()

    if new_words:
        # Append genuinely new labels so words.txt / classes.json stay in sync.
        existing = config.load_words()
        with open(config.WORDS_FILE, "a", encoding="utf-8") as f:
            for w in new_words:
                if w not in existing:
                    f.write(("" if open(config.WORDS_FILE).read().endswith("\n") else "\n") + w + "\n")
        print(f"[words.txt] added: {', '.join(sorted(set(new_words)))}")

    print(f"\n[done] {total_ok}/{total_seen} clips → samples in {config.DATA_DIR}")
    print("Next: python train.py   (or finetune.py for transfer learning)")


if __name__ == "__main__":
    main()
