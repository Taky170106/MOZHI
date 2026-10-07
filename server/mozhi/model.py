"""
model.py — BiGRU + Temporal Attention classifier for Sanket ISL recognition.

Architecture:
    Input:  (batch, SEQUENCE_LENGTH, FEATURE_DIM)  e.g. (B, 30, 144)
      ↓
    BiGRU (2 layers, hidden 64, dropout 0.35)
      ↓
    Temporal attention (learnable query vector that scores each timestep)
      ↓
    Dropout → Linear → softmax (over num_classes)

Design notes:
    - CPU-first: no operations that require GPU. MPS works as a bonus.
    - The attention layer is lightweight (~130 params). If validation
      accuracy is unstable or attention shows no measurable gain over a
      plain BiGRU baseline (compare val_acc with and without), it can be
      removed by setting use_attention=False — don't over-invest complexity
      here if the data doesn't reward it. Both modes are easy to log.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F

import config


class TemporalAttention(nn.Module):
    """
    Lightweight additive (Bahdanau-style) attention over the time axis.

    Learns a query vector that scores each timestep, producing a weighted
    sum of GRU hidden states. This lets the model up-weight frames where
    the signer is actively performing the sign and down-weight resting /
    transitional frames.

    Parameter count: 2 * hidden_dim + 1 (negligible).
    """

    def __init__(self, hidden_dim: int):
        super().__init__()
        self.W = nn.Linear(hidden_dim, hidden_dim, bias=False)
        self.v = nn.Linear(hidden_dim, 1, bias=False)

    def forward(self, gru_output: torch.Tensor) -> torch.Tensor:
        """
        Args:
            gru_output: (batch, seq_len, hidden_dim)

        Returns:
            context: (batch, hidden_dim)  — attention-weighted summary.
        """
        # Score each timestep
        energy = torch.tanh(self.W(gru_output))   # (B, T, H)
        scores = self.v(energy).squeeze(-1)        # (B, T)
        weights = F.softmax(scores, dim=1)         # (B, T)

        # Weighted sum over time
        context = torch.bmm(
            weights.unsqueeze(1),   # (B, 1, T)
            gru_output,             # (B, T, H)
        ).squeeze(1)                # (B, H)

        return context


class ISLClassifier(nn.Module):
    """
    BiGRU + optional temporal attention for ISL sign classification.

    Args:
        num_classes:    number of output classes (len of words.txt).
        input_dim:      feature vector size per frame (config.FEATURE_DIM).
        hidden_dim:     GRU hidden size (config.GRU_HIDDEN_SIZE).
        num_layers:     number of stacked BiGRU layers.
        dropout:        dropout rate between layers and before the classifier.
        use_attention:  if False, fall back to using the last hidden state
                        instead of attention — useful for A/B comparison.
    """

    def __init__(
        self,
        num_classes: int,
        input_dim: int = config.FEATURE_DIM,
        hidden_dim: int = config.GRU_HIDDEN_SIZE,
        num_layers: int = config.GRU_NUM_LAYERS,
        dropout: float = config.DROPOUT_RATE,
        use_attention: bool = True,
    ):
        super().__init__()
        self.use_attention = use_attention
        self.hidden_dim = hidden_dim
        self.num_layers = num_layers

        # BiGRU: output dim = hidden_dim * 2 (forward + backward)
        self.gru = nn.GRU(
            input_size=input_dim,
            hidden_size=hidden_dim,
            num_layers=num_layers,
            batch_first=True,
            bidirectional=True,
            dropout=dropout if num_layers > 1 else 0.0,
        )

        gru_out_dim = hidden_dim * 2  # bidirectional

        if use_attention:
            self.attention = TemporalAttention(gru_out_dim)

        self.dropout = nn.Dropout(dropout)
        self.fc = nn.Linear(gru_out_dim, num_classes)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Args:
            x: (batch, SEQUENCE_LENGTH, FEATURE_DIM)

        Returns:
            logits: (batch, num_classes) — raw scores, no softmax.
                    Use F.softmax(logits, dim=1) for probabilities.
        """
        # GRU forward pass
        gru_out, _ = self.gru(x)  # (B, T, hidden*2)

        if self.use_attention:
            # Attention-weighted summary over time
            summary = self.attention(gru_out)  # (B, hidden*2)
        else:
            # Fallback: use the last timestep's hidden state
            summary = gru_out[:, -1, :]  # (B, hidden*2)

        summary = self.dropout(summary)
        logits = self.fc(summary)  # (B, num_classes)
        return logits


def build_model(num_classes: int, use_attention: bool = True) -> ISLClassifier:
    """
    Factory function to build the ISL classifier with config defaults.

    Args:
        num_classes:   number of sign words.
        use_attention: toggle attention layer for A/B testing.

    Returns:
        ISLClassifier instance (on CPU).
    """
    model = ISLClassifier(
        num_classes=num_classes,
        use_attention=use_attention,
    )

    # Log parameter count for sanity checking
    total_params = sum(p.numel() for p in model.parameters())
    trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"[Model] {total_params:,} params ({trainable:,} trainable), "
          f"attention={'ON' if use_attention else 'OFF'}")

    return model
