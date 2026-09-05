import json, time
import numpy as np
from ai_edge_litert.interpreter import Interpreter

itp = Interpreter(model_path="popsign/model.tflite")
sig = itp.get_signature_list()
print("signatures:", sig)

labels = [None] * 250
for w, i in json.load(open("popsign/sign_to_prediction_index_map.json")).items():
    labels[i] = w

runner = itp.get_signature_runner("serving_default")
d = runner.get_input_details()
print("signature input details:", {k: (v['shape'].tolist(), str(v['dtype'])) for k, v in d.items()})

def probe(frames, seed):
    rng = np.random.default_rng(seed)
    # 543 MediaPipe Holistic landmarks per frame, (x, y, z), normalised ~[0,1]
    x = rng.uniform(0.25, 0.75, size=(frames, 543, 3)).astype(np.float32)
    t = time.perf_counter()
    out = runner(inputs=x)
    ms = (time.perf_counter() - t) * 1000
    v = list(out.values())[0].reshape(-1)
    return v, ms

for frames in (1, 8, 16, 32, 64):
    try:
        v, ms = probe(frames, 0)
        top = np.argsort(v)[::-1][:5]
        print(f"  frames={frames:<3} ok  {ms:6.1f}ms  sum={v.sum():.4f}  top: " +
              ", ".join(f"{labels[i]} {v[i]*100:.1f}%" for i in top))
    except Exception as e:
        print(f"  frames={frames:<3} FAILED: {str(e)[:110]}")

print("\ndiscrimination check @32 frames:")
a, _ = probe(32, 1)
b, _ = probe(32, 12345)
print("  identical:", np.allclose(a, b, atol=1e-6))
print("  A top:", labels[int(np.argmax(a))], f"{a.max()*100:.1f}%")
print("  B top:", labels[int(np.argmax(b))], f"{b.max()*100:.1f}%")
