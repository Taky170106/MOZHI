"""
dataset.py — PyTorch Dataset and DataLoader factory for Sanket ISL.

Loads .npy landmark samples + labels.csv, applies landmark-space
augmentation at training time, and produces stratified 80/20
train/val splits.
"""

import csv
import os
import random

import numpy as np
import torch
from torch.utils.data import Dataset, DataLoader, Subset
from sklearn.model_selection import StratifiedShuffleSplit

import config
from landmark_utils import resample_sequence


# ──────────────────────────────────────────────────────────────────────
# Augmentation helpers (all operate in landmark space, not pixel space)
# ──────────────────────────────────────────────────────────────────────

def _gaussian_jitter(seq: np.ndarray) -> np.ndarray:
    """Add small Gaussian noise to every coordinate."""
    noise = np.random.normal(0, config.AUGMENT_JITTER_STD, seq.shape)
    return seq + noise.astype(np.float32)


def _time_warp(seq: np.ndarray) -> np.ndarray:
    """
    Randomly stretch or compress the sequence temporally by ±20%,
    then resample back to the canonical length.
    """
    T = seq.shape[0]
    lo, hi = config.AUGMENT_TIME_WARP_RANGE
    warp_factor = random.uniform(lo, hi)
    warped_len = max(2, int(T * warp_factor))

    # Resample to warped length, then back to canonical
    warped = resample_sequence(seq, target_length=warped_len)
    return resample_sequence(warped, target_length=config.SEQUENCE_LENGTH)


def _translate_jitter(seq: np.ndarray) -> np.ndarray:
    """Small random spatial translation applied uniformly to all landmarks."""
    shift = np.random.uniform(
        -config.AUGMENT_TRANSLATE_RANGE,
        config.AUGMENT_TRANSLATE_RANGE,
        size=3,  # x, y, z
    ).astype(np.float32)

    out = seq.copy()
    num_landmarks = config.FEATURE_DIM // 3
    for j in range(num_landmarks):
        out[:, j * 3 : j * 3 + 3] += shift
    return out


def _scale_jitter(seq: np.ndarray) -> np.ndarray:
    """Small random uniform scaling of all coordinates."""
    lo, hi = config.AUGMENT_SCALE_RANGE
    scale = random.uniform(lo, hi)
    return seq * scale


def augment(seq: np.ndarray) -> np.ndarray:
    """
    Apply a random subset of augmentations.  Each one is applied
    independently with 50% probability so the model sees variety.
    """
    if random.random() < 0.5:
        seq = _gaussian_jitter(seq)
    if random.random() < 0.5:
        seq = _time_warp(seq)
    if random.random() < 0.5:
        seq = _translate_jitter(seq)
    if random.random() < 0.5:
        seq = _scale_jitter(seq)
    return seq


# ──────────────────────────────────────────────────────────────────────
# Dataset
# ──────────────────────────────────────────────────────────────────────

class ISLDataset(Dataset):
    """
    Loads all .npy samples referenced by labels.csv.

    Each __getitem__ returns:
        x: FloatTensor of shape (SEQUENCE_LENGTH, FEATURE_DIM)
        y: LongTensor scalar (class index)
    """

    def __init__(self, augment_enabled: bool = False):
        """
        Args:
            augment_enabled: if True, apply random augmentations on-the-fly
                             (should be True for training, False for validation).
        """
        self.augment_enabled = augment_enabled

        # Build the ordered class list from words.txt (matches classes.json)
        self.classes = config.load_words()
        self.class_to_idx = {w: i for i, w in enumerate(self.classes)}

        # Parse labels.csv to build (npy_path, label_index) pairs
        self.samples: list[tuple[str, int]] = []
        self.labels: list[int] = []            # for stratified splitting

        with open(config.LABELS_CSV, "r") as f:
            reader = csv.DictReader(f)
            for row in reader:
                word = row["word"]
                sample_id = row["sample_id"]
                if word not in self.class_to_idx:
                    print(f"[WARN] Skipping unknown word '{word}' in labels.csv")
                    continue
                npy_path = str(config.DATA_DIR / f"{sample_id}.npy")
                if not os.path.exists(npy_path):
                    print(f"[WARN] Missing file {npy_path}, skipping")
                    continue
                idx = self.class_to_idx[word]
                self.samples.append((npy_path, idx))
                self.labels.append(idx)

        print(f"[Dataset] Loaded {len(self.samples)} samples across "
              f"{len(self.classes)} classes (augment={augment_enabled})")

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, index):
        npy_path, label = self.samples[index]
        seq = np.load(npy_path).astype(np.float32)  # (SEQUENCE_LENGTH, FEATURE_DIM)

        if self.augment_enabled:
            seq = augment(seq)

        x = torch.from_numpy(seq)        # (SEQUENCE_LENGTH, FEATURE_DIM)
        y = torch.tensor(label, dtype=torch.long)
        return x, y


# ──────────────────────────────────────────────────────────────────────
# DataLoader factory with stratified split
# ──────────────────────────────────────────────────────────────────────

def get_dataloaders(batch_size: int = None):
    """
    Build train and validation DataLoaders with a stratified 80/20 split.

    Returns:
        (train_loader, val_loader, class_list)
    """
    if batch_size is None:
        batch_size = config.BATCH_SIZE

    # Load full dataset (no augmentation yet — we'll wrap subsets)
    full_dataset = ISLDataset(augment_enabled=False)
    labels_array = np.array(full_dataset.labels)

    # Stratified split
    splitter = StratifiedShuffleSplit(
        n_splits=1,
        test_size=config.VAL_SPLIT,
        random_state=42,
    )
    train_indices, val_indices = next(splitter.split(labels_array, labels_array))

    # Create two dataset instances: one with augmentation, one without
    train_dataset = ISLDataset(augment_enabled=True)
    val_dataset   = ISLDataset(augment_enabled=False)

    train_subset = Subset(train_dataset, train_indices)
    val_subset   = Subset(val_dataset, val_indices)

    train_loader = DataLoader(
        train_subset,
        batch_size=batch_size,
        shuffle=True,
        num_workers=0,       # keep it simple on macOS — avoid fork issues
        drop_last=False,
    )
    val_loader = DataLoader(
        val_subset,
        batch_size=batch_size,
        shuffle=False,
        num_workers=0,
        drop_last=False,
    )

    print(f"[Dataset] Train: {len(train_subset)}, Val: {len(val_subset)}")
    return train_loader, val_loader, full_dataset.classes
