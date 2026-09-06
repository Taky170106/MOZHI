# Drop the Teachable Machine model here

This folder is where the Counter looks for the trained classifier. It expects
**the TensorFlow.js export**, which is three files:

```
app/public/models/tm/
  model.json        ← the graph
  weights.bin       ← the weights (may be several .bin shards, keep them all)
  metadata.json     ← the class labels, in order
```

Nothing else needs changing. `app/src/lib/classifier.ts` reads `metadata.json`
for the label list, so adding classes in Teachable Machine and re-exporting is
the whole update procedure.

## Getting those three files

In Teachable Machine: **Export Model → TensorFlow.js → Download my model**.

That tab, not the Keras one. `converted_keras.zip` contains `keras_model.h5`,
which is a Python artefact — the browser cannot load it, and converting it
locally needs `tensorflowjs` on Python ≤3.13 (this machine is on 3.14, so the
converter will not install here). Re-exporting takes about ten seconds and
avoids all of that.

## The labels have to match the lexicon

Each Teachable Machine class name is uppercased and spaces become hyphens, and
the result has to be an id in `app/src/lib/lexicon.ts`:

```
"Doctor"      → DOCTOR         ✓
"Thank You"   → THANK-YOU      ✓
"How Many"    → HOW-MANY       ✓
"Class 1"     → CLASS-1        ✗  ignored, and reported in the panel
```

An unmapped class is not committed — it cannot be glossed into English or
signed back, so it is not a reading. The panel says which class it was.

### One class you should add

Train a class called **Background** (or `none` / `rest` / `idle`) on an empty
counter, on someone standing still, and on hands mid-transit. A softmax has to
put its mass somewhere; without a null class an empty frame is read as
whichever sign the background happens to resemble. `classifier.ts` treats any
of those names as "nobody is signing" and commits nothing.

`labels.reference.txt` is the label list from the first 32-class export, kept
for reference only — it is not read by the app.
