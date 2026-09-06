"""
landmark_utils.py — Single source of truth for landmark extraction & normalization.

Both collect_data.py and realtime_infer.py import from here, guaranteeing
that training-time and inference-time preprocessing are provably identical.

Updated for MediaPipe 1.0 Task API (mp.tasks.vision.HandLandmarker /
PoseLandmarker) — the legacy mp.solutions.* API was removed in 1.0.

Feature vector layout (per frame):
    Left hand:   21 landmarks × 3 (x, y, z) =  63
    Right hand:  21 landmarks × 3 (x, y, z) =  63
    Upper pose:   6 landmarks × 3 (x, y, z) =  18   (shoulders, elbows, wrists)
    ─────────────────────────────────────────────────
    Total:                                      144

If any body part is not detected, its portion is zero-filled.
The vector length is ALWAYS config.FEATURE_DIM regardless of visibility.
"""

import numpy as np
import mediapipe as mp

import config

# ──────────────────────────────────────────────────────────────────────
# MediaPipe 1.0 Task API aliases
# ──────────────────────────────────────────────────────────────────────
BaseOptions = mp.tasks.BaseOptions
HandLandmarker = mp.tasks.vision.HandLandmarker
HandLandmarkerOptions = mp.tasks.vision.HandLandmarkerOptions
PoseLandmarker = mp.tasks.vision.PoseLandmarker
PoseLandmarkerOptions = mp.tasks.vision.PoseLandmarkerOptions
RunningMode = mp.tasks.vision.RunningMode


# ──────────────────────────────────────────────────────────────────────
# Pose landmark indices we care about (upper body only)
# MediaPipe Pose landmark map:
#   11 = left shoulder,  12 = right shoulder
#   13 = left elbow,     14 = right elbow
#   15 = left wrist,     16 = right wrist
# ──────────────────────────────────────────────────────────────────────
UPPER_POSE_INDICES = [11, 12, 13, 14, 15, 16]


class LandmarkExtractor:
    """
    Wraps MediaPipe HandLandmarker + PoseLandmarker (1.0 Task API) to
    produce a fixed-size feature vector per frame. Designed to be
    instantiated once and called per-frame.

    Uses VIDEO running mode: each frame is processed synchronously and
    must be passed with a monotonically increasing timestamp.
    """

    def __init__(self):
        # ── Hand Landmarker ──────────────────────────────────────────
        # Force CPU delegate — MediaPipe 1.0 defaults to GPU/Metal which
        # crashes on macOS with "Service is unavailable". CPU-first is
        # our hard requirement anyway.
        hand_options = HandLandmarkerOptions(
            base_options=BaseOptions(
                model_asset_path=str(config.HAND_LANDMARKER_MODEL),
                delegate=BaseOptions.Delegate.CPU,
            ),
            running_mode=RunningMode.VIDEO,
            num_hands=2,
            min_hand_detection_confidence=0.5,
            min_hand_presence_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        self.hand_landmarker = HandLandmarker.create_from_options(hand_options)

        # ── Pose Landmarker ──────────────────────────────────────────
        pose_options = PoseLandmarkerOptions(
            base_options=BaseOptions(
                model_asset_path=str(config.POSE_LANDMARKER_MODEL),
                delegate=BaseOptions.Delegate.CPU,
            ),
            running_mode=RunningMode.VIDEO,
            num_poses=1,
            min_pose_detection_confidence=0.5,
            min_pose_presence_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        self.pose_landmarker = PoseLandmarker.create_from_options(pose_options)

        # Monotonically increasing timestamp counter (ms) required by
        # the VIDEO running mode. We increment by 33ms (~30 fps).
        self._timestamp_ms: int = 0

    # ------------------------------------------------------------------ #
    #  Core per-frame extraction                                          #
    # ------------------------------------------------------------------ #
    def extract_frame_vector(self, rgb_frame: np.ndarray) -> tuple[np.ndarray, bool, bool]:
        """
        Process one RGB frame and return a flat float32 vector of length
        config.FEATURE_DIM (144), a boolean indicating if hands were found,
        and a boolean indicating if a person (upper-body pose) was detected.

        Args:
            rgb_frame: H×W×3 uint8 array in RGB colour order (not BGR).

        Returns:
            (vector, hands_found, person_present):
                vector:         1-D numpy array, shape (config.FEATURE_DIM,).
                hands_found:    True if at least one hand was detected.
                person_present: True if upper-body pose was detected.
        """
        # Wrap in MediaPipe Image
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)

        # Advance timestamp
        self._timestamp_ms += 33  # ~30 fps cadence

        # Run detectors
        hand_result = self.hand_landmarker.detect_for_video(
            mp_image, self._timestamp_ms
        )
        pose_result = self.pose_landmarker.detect_for_video(
            mp_image, self._timestamp_ms
        )

        # --- Hands --------------------------------------------------
        left_hand = np.zeros(config.HAND_COORDS, dtype=np.float32)
        right_hand = np.zeros(config.HAND_COORDS, dtype=np.float32)

        hands_found = bool(hand_result.hand_landmarks)

        if hands_found:
            for landmarks, handedness_list in zip(
                hand_result.hand_landmarks,
                hand_result.handedness,
            ):
                # handedness_list is a list of Category objects
                label = handedness_list[0].category_name
                coords = self._flatten_hand(landmarks)
                if label == "Left":
                    # MediaPipe "Left" = signer's right (mirrored camera view)
                    right_hand = coords
                else:
                    left_hand = coords

        # --- Pose (upper body only) ---------------------------------
        pose_vec = np.zeros(config.POSE_COORDS, dtype=np.float32)
        person_present = bool(pose_result.pose_landmarks)

        if person_present:
            # pose_landmarks is a list of NormalizedLandmark lists;
            # we take the first (and only) detected pose.
            landmarks = pose_result.pose_landmarks[0]
            for i, idx in enumerate(UPPER_POSE_INDICES):
                lm = landmarks[idx]
                pose_vec[i * 3]     = lm.x
                pose_vec[i * 3 + 1] = lm.y
                pose_vec[i * 3 + 2] = lm.z

        # --- Concatenate in canonical order --------------------------
        frame_vec = np.concatenate([left_hand, right_hand, pose_vec])
        assert frame_vec.shape == (config.FEATURE_DIM,), (
            f"Expected {config.FEATURE_DIM}, got {frame_vec.shape[0]}"
        )
        return frame_vec, hands_found, person_present

    def close(self):
        """Release MediaPipe resources."""
        self.hand_landmarker.close()
        self.pose_landmarker.close()

    # ------------------------------------------------------------------ #
    #  Internal helpers                                                   #
    # ------------------------------------------------------------------ #
    @staticmethod
    def _flatten_hand(landmarks) -> np.ndarray:
        """Flatten 21 hand NormalizedLandmarks into a 63-element float32 array."""
        coords = np.zeros(config.HAND_COORDS, dtype=np.float32)
        for i, lm in enumerate(landmarks):
            coords[i * 3]     = lm.x
            coords[i * 3 + 1] = lm.y
            coords[i * 3 + 2] = lm.z
        return coords


# ──────────────────────────────────────────────────────────────────────
# Spatial normalization
# ──────────────────────────────────────────────────────────────────────
def normalize_sequence(sequence: np.ndarray) -> np.ndarray:
    """
    Centre on the shoulder midpoint and scale by shoulder width.
    Makes the model invariant to the signer's distance from the camera
    and their horizontal position in the frame.

    Args:
        sequence: shape (T, config.FEATURE_DIM) — raw landmark vectors.

    Returns:
        Normalised array of the same shape.
    """
    seq = sequence.copy().astype(np.float32)
    T = seq.shape[0]

    for t in range(T):
        frame = seq[t]

        # Pose portion starts after both hands
        pose_offset = config.HAND_COORDS * 2

        # Shoulder landmarks are the first two in our pose vector
        # Left shoulder  = pose_vec[0:3]
        # Right shoulder = pose_vec[3:6]
        l_shoulder = frame[pose_offset:pose_offset + 3]
        r_shoulder = frame[pose_offset + 3:pose_offset + 6]

        # If both shoulders are zero (pose not detected), skip normalisation
        # for this frame — zero-filled vectors stay zero.
        if np.allclose(l_shoulder, 0) and np.allclose(r_shoulder, 0):
            continue

        # Centre: midpoint of shoulders
        midpoint = (l_shoulder + r_shoulder) / 2.0

        # Scale: Euclidean distance between shoulders (2D, ignore z)
        shoulder_width = np.linalg.norm(l_shoulder[:2] - r_shoulder[:2])
        if shoulder_width < 1e-6:
            shoulder_width = 1.0  # degenerate case — don't divide by ~0

        # Apply to every (x, y, z) triplet in the frame
        num_landmarks = config.FEATURE_DIM // 3
        for j in range(num_landmarks):
            triplet = frame[j * 3 : j * 3 + 3]
            # Only normalise non-zero landmarks (zero = missing)
            if not np.allclose(triplet, 0):
                triplet = (triplet - midpoint) / shoulder_width
                frame[j * 3 : j * 3 + 3] = triplet

        seq[t] = frame

    return seq


# ──────────────────────────────────────────────────────────────────────
# Temporal resampling to fixed length
# ──────────────────────────────────────────────────────────────────────
def resample_sequence(sequence: np.ndarray, target_length: int = None) -> np.ndarray:
    """
    Resample a variable-length sequence to exactly `target_length` frames
    using linear interpolation along the time axis.

    Args:
        sequence:      shape (T_orig, config.FEATURE_DIM).
        target_length: desired number of frames (defaults to SEQUENCE_LENGTH).

    Returns:
        Array of shape (target_length, config.FEATURE_DIM).
    """
    if target_length is None:
        target_length = config.SEQUENCE_LENGTH

    T_orig = sequence.shape[0]

    # Edge case: empty or single-frame input
    if T_orig == 0:
        return np.zeros((target_length, config.FEATURE_DIM), dtype=np.float32)
    if T_orig == 1:
        return np.tile(sequence[0], (target_length, 1)).astype(np.float32)
    if T_orig == target_length:
        return sequence.astype(np.float32)

    # Linear interpolation: map each target index to a fractional source index
    src_indices = np.linspace(0, T_orig - 1, target_length)
    resampled = np.zeros((target_length, sequence.shape[1]), dtype=np.float32)

    for i, src_idx in enumerate(src_indices):
        low = int(np.floor(src_idx))
        high = min(low + 1, T_orig - 1)
        frac = src_idx - low
        resampled[i] = (1 - frac) * sequence[low] + frac * sequence[high]

    return resampled


# ──────────────────────────────────────────────────────────────────────
# Convenience: full pipeline for one raw sequence
# ──────────────────────────────────────────────────────────────────────
def preprocess_sequence(raw_frames: np.ndarray) -> np.ndarray:
    """
    Full preprocessing pipeline: normalise spatially, then resample to
    the canonical sequence length.

    Args:
        raw_frames: shape (T, config.FEATURE_DIM), any T ≥ 1.

    Returns:
        shape (config.SEQUENCE_LENGTH, config.FEATURE_DIM), float32.
    """
    normed = normalize_sequence(raw_frames)
    resampled = resample_sequence(normed)
    return resampled
