"""
finetune.py — transfer learning for the Sanket/Mozhi ISL classifier (option 4).

The idea: a model pretrained on a large public ISL corpus (INCLUDE, FDMSE-ISL,
or simply this project's own 29-class set) has already learned the hard part —
how hand and body motion maps to signs. We keep that backbone (the BiGRU +
attention) and only re-learn the final classification layer for the
hospital vocabulary, fine-tuning on a small number of clips.

Two phases, both optional and controllable from the CLI:
  1. HEAD-ONLY warmup: freeze the BiGRU, train only the new Linear head. Fast,
     stable, and enough when you have very few samples per new word.
  2. FULL fine-tune: unfreeze everything at a low learning rate so the backbone
     adapts slightly to the new signer/domain without forgetting.

Because the backbone is shared, a new class needs far fewer samples than
training from scratch - which is exactly what "repurpose + a few hospital clips"
needs.

Typical flow:
    # 1. build the base (or reuse the shipped best_model.pth)
    python train.py

    # 2. add hospital clips  (see extract_from_videos.py) then:
    python finetune.py --base best_model.pth --head-epochs 15 --full-epochs 25

Saves best_model.pth (overwrites) and classes.json, so export-onnx.py and the
app pick the result up with no further changes.
"""

import argparse
import json
import time

import torch
import torch.nn as nn
import torch.optim as optim

import config
from dataset import get_dataloaders
from model import build_model


def _run_epoch(model, loader, device, criterion, optimizer=None):
    """One pass. optimizer=None → eval. Returns (loss, acc)."""
    train = optimizer is not None
    model.train(train)
    total_loss = correct = total = 0
    torch.set_grad_enabled(train)
    for xb, yb in loader:
        xb, yb = xb.to(device), yb.to(device)
        logits = model(xb)
        loss = criterion(logits, yb)
        if train:
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
        total_loss += loss.item() * xb.size(0)
        correct += (logits.argmax(1) == yb).sum().item()
        total += xb.size(0)
    torch.set_grad_enabled(True)
    return total_loss / max(total, 1), correct / max(total, 1)


def _load_backbone(model, base_path, device):
    """
    Load a base checkpoint, tolerating a different class count: everything
    except the final `fc` layer is transferred; the head starts fresh whenever
    the number of classes changed.
    """
    sd = torch.load(base_path, map_location=device)
    if isinstance(sd, dict) and "model_state_dict" in sd:
        sd = sd["model_state_dict"]
    model_sd = model.state_dict()
    transfer, skipped = {}, []
    for k, v in sd.items():
        if k in model_sd and model_sd[k].shape == v.shape:
            transfer[k] = v
        else:
            skipped.append(k)
    model_sd.update(transfer)
    model.load_state_dict(model_sd)
    print(f"[finetune] transferred {len(transfer)} tensors from {base_path}"
          + (f"; re-initialised head ({', '.join(skipped)})" if skipped else ""))


def finetune(base_path, head_epochs, full_epochs, head_lr, full_lr):
    device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")
    print(f"[finetune] device: {device}")

    train_loader, val_loader, classes = get_dataloaders()
    num_classes = len(classes)
    with open(config.CLASSES_JSON, "w", encoding="utf-8") as f:
        json.dump(classes, f, indent=2, ensure_ascii=False)
    print(f"[finetune] {num_classes} classes; "
          f"{len(train_loader.dataset)} train / {len(val_loader.dataset)} val")

    model = build_model(num_classes).to(device)
    _load_backbone(model, base_path, device)
    criterion = nn.CrossEntropyLoss()
    best_val = 0.0
    start = time.time()

    def maybe_save(val_acc, tag):
        nonlocal best_val
        if val_acc > best_val:
            best_val = val_acc
            torch.save(model.state_dict(), config.MODEL_CHECKPOINT)
            print(f"    ★ {tag}: new best val_acc={val_acc:.3f} — saved")

    # ── Phase 1: head-only warmup (freeze the recurrent backbone) ─────────
    if head_epochs > 0:
        for p in model.parameters():
            p.requires_grad = False
        for p in model.fc.parameters():
            p.requires_grad = True
        opt = optim.Adam(model.fc.parameters(), lr=head_lr, weight_decay=config.WEIGHT_DECAY)
        print(f"[finetune] phase 1 — head-only, {head_epochs} epochs @ lr={head_lr}")
        for e in range(1, head_epochs + 1):
            tl, ta = _run_epoch(model, train_loader, device, criterion, opt)
            vl, va = _run_epoch(model, val_loader, device, criterion)
            print(f"  [head {e:3d}/{head_epochs}] train_acc={ta:.3f} val_acc={va:.3f}")
            maybe_save(va, "head")

    # ── Phase 2: full fine-tune (unfreeze everything, low LR) ─────────────
    if full_epochs > 0:
        for p in model.parameters():
            p.requires_grad = True
        opt = optim.Adam(model.parameters(), lr=full_lr, weight_decay=config.WEIGHT_DECAY)
        print(f"[finetune] phase 2 — full fine-tune, {full_epochs} epochs @ lr={full_lr}")
        patience = 0
        for e in range(1, full_epochs + 1):
            tl, ta = _run_epoch(model, train_loader, device, criterion, opt)
            vl, va = _run_epoch(model, val_loader, device, criterion)
            print(f"  [full {e:3d}/{full_epochs}] train_acc={ta:.3f} val_acc={va:.3f}")
            before = best_val
            maybe_save(va, "full")
            patience = 0 if best_val > before else patience + 1
            if patience >= config.EARLY_STOP_PATIENCE:
                print(f"[finetune] early stop at epoch {e}")
                break

    print(f"\n[finetune] done in {time.time()-start:.1f}s. best val_acc={best_val:.3f}")
    print(f"[finetune] checkpoint: {config.MODEL_CHECKPOINT}")
    print("[finetune] next: copy to server/sanket and run tools/export-onnx.py")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Transfer-learn the ISL classifier on new/hospital signs")
    ap.add_argument("--base", default=str(config.MODEL_CHECKPOINT),
                    help="checkpoint to start from (default: best_model.pth)")
    ap.add_argument("--head-epochs", type=int, default=15, help="phase-1 head-only epochs (0 to skip)")
    ap.add_argument("--full-epochs", type=int, default=25, help="phase-2 full fine-tune epochs (0 to skip)")
    ap.add_argument("--head-lr", type=float, default=1e-3)
    ap.add_argument("--full-lr", type=float, default=2e-4)
    args = ap.parse_args()
    finetune(args.base, args.head_epochs, args.full_epochs, args.head_lr, args.full_lr)
