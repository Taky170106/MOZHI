"""
h5_to_tfjs.py — Teachable Machine keras_model.h5 → a TensorFlow.js layers model,
without TensorFlow.

A .h5 saved by Keras already contains everything tfjs needs:

  · root attrs `keras_version` / `backend`, and `model_config`, which is the
    architecture as JSON — literally what tfjs calls `modelTopology`
  · `model_weights/<layer>/<weight>`, with each top-level layer group listing
    its own weights in order under a `weight_names` attribute

So the conversion is a repackaging, not a computation: copy the config across,
walk the weights in Keras' own order, write them end to end as little-endian
float32, and describe them in a manifest. No graph is ever built, which is why
this needs only h5py and numpy and runs on a Python that TensorFlow does not
support yet.

Usage:  python h5_to_tfjs.py keras_model.h5 labels.txt out_dir/
"""

import json
import sys
from pathlib import Path

import h5py
import numpy as np


def utf8(x):
    return x.decode("utf8") if isinstance(x, bytes) else str(x)


def convert(h5_path: Path, labels_path: Path, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    f = h5py.File(h5_path, "r")

    if "model_config" not in f.attrs:
        raise SystemExit("This .h5 has no model_config — it holds weights only, not a model.")

    model_config = json.loads(utf8(f.attrs["model_config"]))
    keras_version = utf8(f.attrs.get("keras_version", "2.4.0"))
    backend = utf8(f.attrs.get("backend", "tensorflow"))

    mw = f["model_weights"]
    layer_names = [utf8(n) for n in mw.attrs["layer_names"]]

    specs = []
    blobs = []
    total = 0

    for layer_name in layer_names:
        group = mw[layer_name]
        weight_names = [utf8(n) for n in group.attrs.get("weight_names", [])]
        for wn in weight_names:
            arr = np.asarray(group[wn])
            # tfjs writes everything float32; a Keras model has no other dtype
            # in it unless something exotic was trained.
            if arr.dtype != np.float32:
                arr = arr.astype(np.float32)
            # Keras variable names carry a device-ordinal suffix (":0") that
            # tfjs strips — its weight lookup is by the bare name.
            specs.append(
                {"name": wn.split(":")[0], "shape": list(arr.shape), "dtype": "float32"}
            )
            blobs.append(np.ascontiguousarray(arr, dtype="<f4").tobytes())
            total += arr.size

    weights_bin = out_dir / "weights.bin"
    with open(weights_bin, "wb") as out:
        for b in blobs:
            out.write(b)

    model_json = {
        "format": "layers-model",
        "generatedBy": f"keras v{keras_version}",
        "convertedBy": "sanket h5_to_tfjs.py (h5py, no TensorFlow)",
        "modelTopology": {
            "keras_version": keras_version,
            "backend": backend,
            "model_config": model_config,
        },
        "weightsManifest": [{"paths": ["weights.bin"], "weights": specs}],
    }
    (out_dir / "model.json").write_text(json.dumps(model_json))

    # Teachable Machine's own TF.js export ships the class list beside the
    # model; the converter does not produce it, so it is rebuilt from
    # labels.txt. Lines are "0 Delay" — the index is dropped, the name kept.
    labels = []
    for line in labels_path.read_text(encoding="utf8").splitlines():
        line = line.strip()
        if not line:
            continue
        parts = line.split(" ", 1)
        labels.append(parts[1].strip() if len(parts) == 2 and parts[0].isdigit() else line)

    (out_dir / "metadata.json").write_text(
        json.dumps(
            {
                "tfjsVersion": "4.22.0",
                "tmVersion": "converted-locally",
                "packageName": "@teachablemachine/image",
                "timeStamp": "",
                "imageSize": 224,
                "modelName": h5_path.stem,
                "labels": labels,
            },
            indent=1,
        )
    )

    print(f"layers      {len(layer_names)}  ({', '.join(layer_names)})")
    print(f"tensors     {len(specs)}")
    print(f"parameters  {total:,}")
    print(f"weights.bin {weights_bin.stat().st_size:,} bytes  (= {total} × 4 = {total * 4:,})")
    print(f"labels      {len(labels)}  {labels[:3]} …")
    print(f"\nwrote {out_dir}/model.json, weights.bin, metadata.json")


if __name__ == "__main__":
    convert(Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3]))
