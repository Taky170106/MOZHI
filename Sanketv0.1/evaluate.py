"""
evaluate.py — Validation metrics for the Sanket ISL classifier.

Usage:
    python evaluate.py

Outputs:
    1. Overall validation accuracy.
    2. Per-class accuracy breakdown.
    3. Terminal-friendly ASCII confusion matrix.
    4. Top 3–5 most confused word pairs — so you know exactly which signs
       need more or better training data.
"""

import json
from collections import defaultdict

import numpy as np
import torch

import config
from dataset import get_dataloaders
from model import build_model


def load_model_and_classes(device: torch.device):
    """Load the trained checkpoint and the class mapping."""
    with open(config.CLASSES_JSON, "r") as f:
        classes = json.load(f)

    model = build_model(num_classes=len(classes), use_attention=True).to(device)
    state = torch.load(config.MODEL_CHECKPOINT, map_location=device, weights_only=True)
    model.load_state_dict(state)
    model.eval()
    return model, classes


def compute_predictions(model, val_loader, device):
    """Run the model on the entire validation set and collect predictions."""
    all_preds = []
    all_labels = []

    with torch.no_grad():
        for x_batch, y_batch in val_loader:
            x_batch = x_batch.to(device)
            logits = model(x_batch)
            preds = logits.argmax(dim=1).cpu().numpy()
            all_preds.extend(preds)
            all_labels.extend(y_batch.numpy())

    return np.array(all_preds), np.array(all_labels)


def print_confusion_matrix(preds, labels, classes):
    """
    Print a terminal-friendly ASCII confusion matrix.

    For large class counts (>15), truncates long names. For smaller
    vocabularies it prints the full grid.
    """
    n = len(classes)
    cm = np.zeros((n, n), dtype=int)
    for true, pred in zip(labels, preds):
        cm[true][pred] += 1

    # Truncate class names for display
    max_name_len = 10
    short_names = [c[:max_name_len].ljust(max_name_len) for c in classes]

    # Header
    print("\n" + "=" * 60)
    print("CONFUSION MATRIX")
    print("=" * 60)
    print(f"{'':>{max_name_len}}  ", end="")
    for i in range(n):
        print(f"{i:>4}", end="")
    print("   ← predicted")
    print("-" * (max_name_len + 3 + 4 * n + 15))

    for i in range(n):
        print(f"{short_names[i]}| ", end="")
        for j in range(n):
            val = cm[i][j]
            if val == 0:
                print("   .", end="")
            elif i == j:
                # Highlight diagonal (correct predictions)
                print(f"{val:>4}", end="")
            else:
                print(f"{val:>4}", end="")
        print(f"   | {classes[i]}")

    print("-" * (max_name_len + 3 + 4 * n +15))

    # Legend
    print(f"\nRows = true class, Columns = predicted class")
    print(f"'.' = zero\n")

    return cm


def print_most_confused(cm, classes, top_k=5):
    """
    Print the top-K most confused word pairs.

    These are the off-diagonal cells with the highest counts,
    telling you exactly which signs are most often mistaken for
    each other — i.e., where you need more/better training data.
    """
    n = len(classes)
    confusions = []
    for i in range(n):
        for j in range(n):
            if i != j and cm[i][j] > 0:
                confusions.append((cm[i][j], classes[i], classes[j]))

    confusions.sort(reverse=True)

    print("=" * 60)
    print(f"TOP {min(top_k, len(confusions))} MOST CONFUSED PAIRS")
    print("=" * 60)

    if not confusions:
        print("  No confusions found — perfect classification!")
        return

    for count, true_word, pred_word in confusions[:top_k]:
        print(f"  '{true_word}' misclassified as '{pred_word}' — {count} time(s)")

    print()


def print_per_class_accuracy(cm, classes):
    """Print accuracy for each class."""
    print("=" * 60)
    print("PER-CLASS ACCURACY")
    print("=" * 60)

    for i, word in enumerate(classes):
        total = cm[i].sum()
        correct = cm[i][i]
        acc = correct / total if total > 0 else 0.0
        bar = "█" * int(acc * 20)
        print(f"  {word:<15} {correct:>3}/{total:<3}  {acc:.1%}  {bar}")

    print()


def evaluate():
    """Run full evaluation on the validation set."""
    device = torch.device("cpu")  # eval is fine on CPU

    print(f"[Eval] Loading checkpoint: {config.MODEL_CHECKPOINT}")
    model, classes = load_model_and_classes(device)

    _, val_loader, _ = get_dataloaders()

    print(f"[Eval] Running inference on {len(val_loader.dataset)} validation samples...")
    preds, labels = compute_predictions(model, val_loader, device)

    # Overall accuracy
    overall_acc = (preds == labels).mean()
    print(f"\n{'=' * 60}")
    print(f"OVERALL VALIDATION ACCURACY: {overall_acc:.1%} "
          f"({(preds == labels).sum()}/{len(labels)})")
    print(f"{'=' * 60}")

    # Confusion matrix
    cm = print_confusion_matrix(preds, labels, classes)

    # Per-class accuracy
    print_per_class_accuracy(cm, classes)

    # Most confused pairs
    print_most_confused(cm, classes, top_k=5)


# ─────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    evaluate()
