"""
fetch_include.py — arrange the INCLUDE (AI4Bharat) ISL video dataset — or any
similarly-structured ISL corpus — into the `videos/<word>/clip.mp4` layout that
extract_from_videos.py expects.

Why a separate step: the raw INCLUDE download is ~56 GB, gated behind a Zenodo
bash script, and laid out by *category* ("Adjectives/1. loud/MVI_1234.MOV"),
not by the flat word folders our extractor wants. This script walks that tree,
picks the words you actually need for the reception counter, and copies (or links)
the matching clips into ./videos/<word>/.

────────────────────────────────────────────────────────────────────────
STEP 0 — download INCLUDE first (this script does NOT download 56 GB for you)
────────────────────────────────────────────────────────────────────────
  • Metadata + the fetch script:  https://huggingface.co/datasets/ai4bharat/INCLUDE
  • Video archives (Zenodo):       https://zenodo.org/records/4010759
  • Code / paper:                  https://github.com/AI4Bharat/INCLUDE
Unzip so you have a tree like:
    INCLUDE/
      Adjectives/ 1. loud/ MVI_0001.MOV ...
      Greetings/  10. hello/ ...
      ...
(CISLR from https://huggingface.co/datasets/IIT-K/CISLR works too — point
 --include-root at its video folder; it is already fairly flat.)

────────────────────────────────────────────────────────────────────────
STEP 1 — arrange the words you need
────────────────────────────────────────────────────────────────────────
  # only the generic signs a reception desk reuses (default word list below):
  python fetch_include.py --include-root /path/to/INCLUDE --out ./videos

  # a custom set (one word per line; matches are case/þnumber-insensitive):
  python fetch_include.py --include-root /path/to/INCLUDE --out ./videos --words my_words.txt

  # symlink instead of copy (saves disk; Windows needs admin/dev-mode):
  python fetch_include.py --include-root /path/to/INCLUDE --out ./videos --link

Then continue with the runbook:
  python extract_from_videos.py --videos ./videos --signer include --add-missing-words
  python finetune.py --base best_model.pth
"""

import argparse
import re
import shutil
from pathlib import Path

VIDEO_EXTS = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v"}

# Generic ISL signs that a hospital reception desk actually reuses and that a
# general corpus like INCLUDE is likely to contain. Domain-specific glosses
# (fever, pain, medicine, emergency) usually are NOT in INCLUDE — get those
# from an ISLRTC dictionary or record them yourself.
DEFAULT_GENERIC_WORDS = [
    "hello", "thank you", "please", "sorry", "yes", "no", "help", "name",
    "where", "when", "how much", "come", "go", "sit", "stand", "wait", "stop",
    "good", "bad", "welcome", "goodbye", "phone", "address", "time",
    "today", "tomorrow", "write", "give", "show", "number",
]


def canon(name: str) -> str:
    """
    Normalise a folder name to a bare word:
      "10. hello"  -> "hello"
      "Thank_You"  -> "thank you"
      "How  Much"  -> "how much"
    """
    s = name.strip().lower()
    s = re.sub(r"^\s*\d+[\.\)]\s*", "", s)   # strip leading "10." / "3)"
    s = s.replace("_", " ").replace("-", " ")
    s = re.sub(r"\s+", " ", s).strip()
    return s


def load_words(path: str | None) -> set[str]:
    if not path:
        return {canon(w) for w in DEFAULT_GENERIC_WORDS}
    words = set()
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            words.add(canon(line))
    return words


def main():
    ap = argparse.ArgumentParser(description="Arrange INCLUDE/CISLR clips into videos/<word>/")
    ap.add_argument("--include-root", required=True, help="path to the unzipped INCLUDE (or CISLR) folder")
    ap.add_argument("--out", default="./videos", help="output root (default ./videos)")
    ap.add_argument("--words", default=None, help="txt file of words to pull (default: built-in generic set)")
    ap.add_argument("--link", action="store_true", help="symlink instead of copy (saves disk)")
    ap.add_argument("--max-per-word", type=int, default=0, help="cap clips per word (0 = all)")
    args = ap.parse_args()

    root = Path(args.include_root)
    if not root.is_dir():
        raise SystemExit(f"--include-root not found: {root}")
    out = Path(args.out)
    wanted = load_words(args.words)
    print(f"[fetch] looking for {len(wanted)} words under {root}")

    # Walk every directory; a directory whose canonical name is a wanted word
    # and that directly contains video files is treated as that word's clips.
    grabbed: dict[str, int] = {}
    for d in root.rglob("*"):
        if not d.is_dir():
            continue
        word = canon(d.name)
        if word not in wanted:
            continue
        clips = [p for p in d.iterdir() if p.suffix.lower() in VIDEO_EXTS]
        if not clips:
            continue
        dest_dir = out / word.replace(" ", "_")
        dest_dir.mkdir(parents=True, exist_ok=True)
        for clip in sorted(clips):
            if args.max_per_word and grabbed.get(word, 0) >= args.max_per_word:
                break
            dest = dest_dir / clip.name
            if dest.exists():
                continue
            try:
                if args.link:
                    dest.symlink_to(clip.resolve())
                else:
                    shutil.copy2(clip, dest)
                grabbed[word] = grabbed.get(word, 0) + 1
            except OSError as e:
                print(f"    [warn] {clip.name}: {e}")

    if not grabbed:
        raise SystemExit(
            "No matching word folders found. Check --include-root points at the\n"
            "unzipped dataset, and that folder names match your word list.")

    total = sum(grabbed.values())
    print(f"\n[fetch] arranged {total} clips across {len(grabbed)} words → {out}")
    for w in sorted(grabbed):
        print(f"    {w:>12} : {grabbed[w]}")
    missing = sorted(wanted - set(grabbed))
    if missing:
        print(f"\n[fetch] NOT found in this corpus ({len(missing)}): {', '.join(missing)}")
        print("        → these need the ISLRTC legal dictionary or your own recordings.")
    print("\nNext: python extract_from_videos.py --videos", args.out, "--signer include --add-missing-words")


if __name__ == "__main__":
    main()
