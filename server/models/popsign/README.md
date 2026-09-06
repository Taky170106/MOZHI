# PopSign ASL — the bench recogniser

The 1st-place entry from Google's [Isolated Sign Language Recognition][comp]
competition, taken from [`sign/kaggle-asl-signs-1st-place`][hf] (MIT).
250 American Sign Language classes, trained on ~100k clips from Deaf signers.

    model.tflite                        11 MB
    sign_to_prediction_index_map.json   the 250 class names

## What it is for, and what it is not

This is a **bench**, not the product's recogniser. Two reasons, both of which
should be said out loud rather than discovered at a demo:

**It is the wrong language.** Sanket is an Indian Sign Language terminal.
ASL is a different language — different grammar, and a one-handed manual
alphabet where ISL's is two-handed. The Counter labels this backend
"ASL bench" on screen precisely so it cannot be mistaken for the real thing.

**It knows 22 of the 60 signs**, and none of the ones the product is about:

> covered — HELLO THANK-YOU PLEASE YES NO MY WHERE WHY NOW TOMORROW
> YESTERDAY MORNING TIME WAIT HEAD SICK ROOM OPEN SEE GO BAD FINISH
>
> absent — DOCTOR HOSPITAL MEDICINE PAIN FEVER APPOINTMENT FORM SIGNATURE
> MONEY NUMBER HELP YOU WHAT TODAY NEED COME, and every other counter word

What it *is* good for is proving the pipeline: a real sequence model that
reads movement, end to end through the segmenter, at ~10 ms an inference.

## Why it runs in Python

It cannot run in the browser. `@tensorflow/tfjs-tflite` loads the model in
91 ms and then aborts on every inference: the model's input tensor is pinned
to one frame, the real input is F frames, and that runtime — `0.0.1-alpha.10`,
its only release, long abandoned — exposes no way to resize it. Verified at
both its high-level and low-level APIs.

`ai-edge-litert` resizes it happily and, unlike TensorFlow, publishes a
cp314 arm64 wheel, so it installs on the Python already on this machine.

## Running it

```bash
cd server && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
npm run islr --prefix app          # or: server/.venv/bin/python server/islr.py
```

The dev server proxies `/islr` to it on port 5302. With no Teachable Machine
model in `app/public/models/tm/`, the Counter picks this up automatically the
next time the camera is switched on. **The moment a real ISL model is dropped
into `public/models/tm/`, that one wins and this is ignored** — see the
backend selection in `app/src/lib/live.ts`.

## The one thing that fails silently

The landmark order is the competition's, and a mis-ordered frame produces a
confident wrong answer rather than an error:

    face        0   – 467
    left_hand   468 – 488
    pose        489 – 521
    right_hand  522 – 542

Missing landmarks are **NaN**, not zero — zero is a real coordinate, the
top-left corner, so zeros say "the hand is at the edge of frame" rather than
"there is no hand". `app/src/lib/islr.ts` packs it; the packing is covered by
an offset test, since nothing downstream would catch a mistake here.

Bench script for the model on its own: `tools/islr-bench.py`.

[comp]: https://www.kaggle.com/competitions/asl-signs
[hf]: https://huggingface.co/sign/kaggle-asl-signs-1st-place
