"""
check_all.py — Run EVERY sample in labels.csv through the model and say
exactly which ones fail.

evaluate.py only reports the 20% validation split, so its headline number
never covers the whole training set. This script covers all of it, and adds
the two things that matter for the live counter:

  * per-sample softmax confidence, because the engine rejects anything under
    CONFIDENCE_THRESHOLD — a sample can be argmax-correct and still never be
    emitted, which reads as "no output";
  * the same run through the ONNX graph the browser actually executes, so a
    pass here means the shipped bundle passes too.

Usage:
    python check_all.py

Writes:
    check_all_results.csv   every sample, its prediction, confidence, verdict
"""

import csv
import json
from collections import defaultdict

import numpy as np
import torch
import torch.nn.functional as F

import config
from model import build_model

THRESH = config.CONFIDENCE_THRESHOLD
ONNX_PATH = config.PROJECT_ROOT.parent / "server" / "mozhi" / "mozhi-isl.onnx"
OUT_CSV = config.PROJECT_ROOT / "check_all_results.csv"
BATCH = 64


def load_rows():
    """Replicates ISLDataset's skip rules so counts line up exactly."""
    classes = config.load_words()
    c2i = {w: i for i, w in enumerate(classes)}
    rows = []
    skipped_unknown, skipped_missing = [], []
    with open(config.LABELS_CSV, "r") as f:
        for row in csv.DictReader(f):
            word, sid = row["word"], row["sample_id"]
            signer = row.get("signer", "")
            if word not in c2i:
                skipped_unknown.append(word)
                continue
            p = config.DATA_DIR / f"{sid}.npy"
            if not p.exists():
                skipped_missing.append(sid)
                continue
            rows.append((str(p), c2i[word], word, sid, signer))
    return rows, classes, skipped_unknown, skipped_missing


def load_torch(classes):
    m = build_model(num_classes=len(classes), use_attention=True)
    state = torch.load(config.MODEL_CHECKPOINT, map_location="cpu", weights_only=True)
    m.load_state_dict(state)
    m.eval()
    return m


def stack(paths):
    seqs = [np.load(p).astype(np.float32) for p in paths]
    bad = [(p, s.shape) for p, s in zip(paths, seqs)
           if s.shape != (config.SEQUENCE_LENGTH, config.FEATURE_DIM)]
    if bad:
        raise SystemExit(f"[FATAL] {len(bad)} sample(s) have the wrong shape, "
                         f"first: {bad[0][0]} -> {bad[0][1]}")
    return np.stack(seqs)


def main():
    rows, classes, unk, miss = load_rows()
    print(f"[check] labels.csv rows : {len(rows)}")
    print(f"[check] classes         : {len(classes)}")
    if unk:
        print(f"[check] skipped unknown : {len(unk)} -> {sorted(set(unk))}")
    if miss:
        print(f"[check] skipped missing : {len(miss)} (first {miss[:3]})")

    device = torch.device("cpu")
    model = load_torch(classes).to(device)

    sess = None
    if ONNX_PATH.exists():
        import onnxruntime as ort
        sess = ort.InferenceSession(str(ONNX_PATH),
                                    providers=["CPUExecutionProvider"])
        onnx_in = sess.get_inputs()[0].name
        print(f"[check] onnx            : {ONNX_PATH}")
    else:
        print(f"[check] onnx            : NOT FOUND, torch only")

    y_true, t_pred, t_conf = [], [], []
    o_pred, o_conf, o_delta = [], [], []

    paths = [r[0] for r in rows]
    for i in range(0, len(paths), BATCH):
        chunk = paths[i:i + BATCH]
        x = torch.from_numpy(stack(chunk))

        with torch.no_grad():
            logits = model(x)
            probs_t = F.softmax(logits, dim=1).numpy()
        tp = probs_t.argmax(1)
        tc = probs_t.max(1)

        # The exported graph pins batch to 1, so ONNX runs in its own
        # per-sample loop below — placeholders here keep the zip aligned.
        po = np.full(len(chunk), -1)
        pc = np.zeros(len(chunk))

        y_true.extend(r[1] for r in rows[i:i + BATCH])
        t_pred.extend(tp.tolist())
        t_conf.extend(tc.tolist())
        o_pred.extend(po.tolist())
        o_conf.extend(pc.tolist())

    # ── ONNX, one sample at a time (batch dim is fixed to 1) ────────
    if sess is not None:
        torch_probs = []
        with torch.no_grad():
            for i in range(0, len(paths), BATCH):
                x = torch.from_numpy(stack(paths[i:i + BATCH]))
                torch_probs.append(F.softmax(model(x), dim=1).numpy())
        torch_probs = np.concatenate(torch_probs)

        for k, p in enumerate(paths):
            x1 = np.load(p).astype(np.float32)[None, ...]
            logits = sess.run(None, {onnx_in: x1})[0].reshape(-1)
            # The graph emits LOGITS — softmax lives in sanket-onnx.ts at run
            # time — so mirror that transform before comparing probabilities.
            shifted = logits - float(logits.max())
            exp = np.exp(shifted)
            po = exp / exp.sum()
            o_pred[k] = int(po.argmax())
            o_conf[k] = float(po.max())
            o_delta.append(float(np.abs(po - torch_probs[k]).max()))

    y_true = np.array(y_true)
    t_pred = np.array(t_pred)
    t_conf = np.array(t_conf)
    o_pred = np.array(o_pred)
    o_conf = np.array(o_conf)

    n = len(y_true)
    t_ok = t_pred == y_true
    t_pass = t_conf >= THRESH
    o_ok = (o_pred == y_true) if sess is not None else np.zeros(n, bool)
    o_pass = (o_conf >= THRESH) if sess is not None else np.zeros(n, bool)

    print("\n" + "=" * 68)
    print(f"FULL DATASET  ({n} samples, {len(classes)} classes)")
    print("=" * 68)
    print(f"  torch argmax accuracy     : {t_ok.mean():.1%}  ({t_ok.sum()}/{n})")
    print(f"  torch conf >= {THRESH:<4}          : {t_pass.mean():.1%}  ({t_pass.sum()}/{n})")
    print(f"  would EMIT correctly      : {(t_ok & t_pass).mean():.1%}  ({(t_ok & t_pass).sum()}/{n})")
    print(f"  correct but BELOW {THRESH:<4}   : {(t_ok & ~t_pass).sum()}   <- silently dropped live")
    print(f"  wrong but ABOVE {THRESH:<4}    : {((~t_ok) & t_pass).sum()}   <- wrong word emitted")
    print(f"  argmax wrong outright     : {(~t_ok).sum()}")
    if sess is not None:
        print("-" * 68)
        print(f"  onnx argmax accuracy      : {o_ok.mean():.1%}  ({o_ok.sum()}/{n})")
        print(f"  onnx conf >= {THRESH:<4}           : {o_pass.mean():.1%}  ({o_pass.sum()}/{n})")
        print(f"  torch vs onnx argmax match: {(o_pred == t_pred).mean():.1%}  ({(o_pred == t_pred).sum()}/{n})")
        print(f"  max |prob delta|          : {max(o_delta):.3e}")

    # ── per class ────────────────────────────────────────────────────
    print("\n" + "=" * 68)
    print("PER-CLASS  (sorted worst first)")
    print("=" * 68)
    print(f"  {'word':<20} {'ok':>7} {'acc':>7} {'<thr':>5} {'conf':>6}")
    per = []
    for i, w in enumerate(classes):
        m = y_true == i
        if not m.any():
            continue
        acc = t_ok[m].mean()
        below = int((~t_pass[m]).sum())
        conf = t_conf[m].mean()
        per.append((acc, w, int(t_ok[m].sum()), int(m.sum()), below, conf))
    for acc, w, c, tot, below, conf in sorted(per):
        flag = "  <-- all below thr" if below == tot else ("  <-- weak" if acc < 0.9 else "")
        print(f"  {w:<20} {c:>3}/{tot:<3} {acc:>6.1%} {below:>5} {conf:>6.3f}{flag}")

    # ── top confusions ──────────────────────────────────────────────
    pairs = defaultdict(int)
    for yt, yp in zip(y_true, t_pred):
        if yt != yp:
            pairs[(classes[yt], classes[yp])] += 1
    print("\n" + "=" * 68)
    print("TOP CONFUSED PAIRS")
    print("=" * 68)
    if not pairs:
        print("  none — perfect")
    for (a, b), cnt in sorted(pairs.items(), key=lambda kv: -kv[1])[:15]:
        print(f"  '{a}' -> '{b}'  x{cnt}")

    # ── write every sample ──────────────────────────────────────────
    with open(OUT_CSV, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["sample_id", "word", "signer", "y_true",
                    "torch_pred", "torch_conf", "torch_pass",
                    "onnx_pred", "onnx_conf", "onnx_pass", "verdict"])
        for k in range(n):
            sid, _, word, _, signer = rows[k][3], rows[k][1], rows[k][2], rows[k][0], rows[k][4]
            if not t_ok[k]:
                verdict = "WRONG"
            elif not t_pass[k]:
                verdict = "DROP_BELOW_THRESHOLD"
            else:
                verdict = "OK"
            w.writerow([sid, word, signer, classes[y_true[k]],
                        classes[t_pred[k]], f"{t_conf[k]:.4f}", int(t_pass[k]),
                        classes[o_pred[k]] if sess is not None else "",
                        f"{o_conf[k]:.4f}" if sess is not None else "",
                        int(o_pass[k]) if sess is not None else "",
                        verdict])

    # ── per signer ──────────────────────────────────────────────────
    by_signer = defaultdict(list)
    for k in range(n):
        by_signer[rows[k][4]].append(k)
    if any(by_signer):
        print("\n" + "=" * 68)
        print("PER-SIGNER")
        print("=" * 68)
        for s, idxs in sorted(by_signer.items()):
            idxs = np.array(idxs)
            print(f"  {s:<12} acc {t_ok[idxs].mean():.1%} "
                  f"({t_ok[idxs].sum()}/{len(idxs)})  "
                  f"emit {(t_ok[idxs] & t_pass[idxs]).mean():.1%}")

    print(f"\n[check] wrote {OUT_CSV}")
    print(f"[check] FAILING SAMPLES: {int((~t_ok | ~t_pass).sum())} of {n}")
    return 0 if t_ok.all() else 1


if __name__ == "__main__":
    raise SystemExit(main())
