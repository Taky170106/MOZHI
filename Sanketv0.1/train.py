"""
train.py — Training loop for Sanket ISL classifier.

Usage:
    python train.py                        # train with attention (default)
    python train.py --no-attention         # train without attention (A/B test)

Saves:
    - best_model.pth   — checkpoint with the best validation accuracy.
    - classes.json      — ordered index-to-word mapping matching words.txt.

Designed to complete in well under 10 minutes for ~1000 samples on M4.
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


def train(use_attention: bool = True):
    """Full training run with early stopping on validation accuracy."""

    # ── Device selection ────────────────────────────────────────────
    # CPU is the hard requirement. MPS is a nice-to-have fallback.
    if torch.backends.mps.is_available():
        device = torch.device("mps")
        print("[Train] Using Apple MPS (Metal) backend")
    else:
        device = torch.device("cpu")
        print("[Train] Using CPU")

    # ── Data ────────────────────────────────────────────────────────
    train_loader, val_loader, classes = get_dataloaders()
    num_classes = len(classes)
    print(f"[Train] {num_classes} classes, "
          f"{len(train_loader.dataset)} train / {len(val_loader.dataset)} val")

    # Save the class list so inference can map indices back to words
    with open(config.CLASSES_JSON, "w") as f:
        json.dump(classes, f, indent=2)
    print(f"[Train] Saved class mapping → {config.CLASSES_JSON}")

    # ── Model ───────────────────────────────────────────────────────
    model = build_model(num_classes, use_attention=use_attention).to(device)

    # ── Optimizer & loss ────────────────────────────────────────────
    optimizer = optim.Adam(
        model.parameters(),
        lr=config.LEARNING_RATE,
        weight_decay=config.WEIGHT_DECAY,
    )
    criterion = nn.CrossEntropyLoss()

    # ── Early stopping state ────────────────────────────────────────
    best_val_acc = 0.0
    patience_counter = 0

    # ── Training loop ───────────────────────────────────────────────
    start_time = time.time()

    for epoch in range(1, config.MAX_EPOCHS + 1):
        # ---- Train phase ----
        model.train()
        train_loss = 0.0
        train_correct = 0
        train_total = 0

        for x_batch, y_batch in train_loader:
            x_batch = x_batch.to(device)
            y_batch = y_batch.to(device)

            optimizer.zero_grad()
            logits = model(x_batch)
            loss = criterion(logits, y_batch)
            loss.backward()
            optimizer.step()

            train_loss += loss.item() * x_batch.size(0)
            preds = logits.argmax(dim=1)
            train_correct += (preds == y_batch).sum().item()
            train_total += x_batch.size(0)

        train_loss /= max(train_total, 1)
        train_acc = train_correct / max(train_total, 1)

        # ---- Validation phase ----
        model.eval()
        val_loss = 0.0
        val_correct = 0
        val_total = 0

        with torch.no_grad():
            for x_batch, y_batch in val_loader:
                x_batch = x_batch.to(device)
                y_batch = y_batch.to(device)

                logits = model(x_batch)
                loss = criterion(logits, y_batch)

                val_loss += loss.item() * x_batch.size(0)
                preds = logits.argmax(dim=1)
                val_correct += (preds == y_batch).sum().item()
                val_total += x_batch.size(0)

        val_loss /= max(val_total, 1)
        val_acc = val_correct / max(val_total, 1)

        elapsed = time.time() - start_time
        print(f"  Epoch {epoch:3d}/{config.MAX_EPOCHS}  "
              f"train_loss={train_loss:.4f}  train_acc={train_acc:.3f}  "
              f"val_loss={val_loss:.4f}  val_acc={val_acc:.3f}  "
              f"[{elapsed:.1f}s]")

        # ---- Early stopping check ----
        if val_acc > best_val_acc:
            best_val_acc = val_acc
            patience_counter = 0
            torch.save(model.state_dict(), config.MODEL_CHECKPOINT)
            print(f"  ★ New best val_acc={best_val_acc:.3f} — saved checkpoint")
        else:
            patience_counter += 1
            if patience_counter >= config.EARLY_STOP_PATIENCE:
                print(f"\n[Train] Early stopping after {epoch} epochs "
                      f"(no improvement for {config.EARLY_STOP_PATIENCE} epochs)")
                break

    # ── Summary ─────────────────────────────────────────────────────
    total_time = time.time() - start_time
    print(f"\n[Train] Done in {total_time:.1f}s. "
          f"Best val accuracy: {best_val_acc:.3f}")
    print(f"[Train] Checkpoint: {config.MODEL_CHECKPOINT}")
    print(f"[Train] Classes:    {config.CLASSES_JSON}")


# ─────────────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train Sanket ISL classifier")
    parser.add_argument(
        "--no-attention", action="store_true",
        help="Disable the temporal attention layer (A/B comparison)",
    )
    args = parser.parse_args()
    train(use_attention=not args.no_attention)
