# Mozhi · மொழி

**A two-way Indian Sign Language communication terminal for public service counters.**

A deaf visitor signs. The screen turns it into text for the counter staff. The
staff type a reply, and a 3D avatar signs that reply back in Indian Sign
Language. Recognition runs on the counter's own machine.

> Every comparable system translates sign to text only — letting a deaf person
> be heard, but never hear the reply. Mozhi closes the loop.

---

## Why

India has fewer than three hundred certified sign language interpreters, for
millions of deaf people. At a hospital reception, a railway enquiry window or a
bank counter there is usually no interpreter at all, so a deaf visitor falls
back on written notes or brings a hearing relative to speak for them — losing
privacy and independence on every ordinary errand.

Almost every digital sign-language system solves only half of that. It handles
expression, not conversation: the deaf person can be understood, and then waits
while a clerk reaches for a pen.

The Rights of Persons with Disabilities Act, 2016 already obliges Indian public
services to provide accessible communication. An interpreter at every counter
does not scale. A terminal does.

---

## How it works

Every camera frame is reduced to **543 landmark coordinates** — 33 body, 21 per
hand and a 468-point face mesh — rather than kept as an image. That
representation is small enough to classify on a CPU, and the same coordinates
drive the avatar's skeleton. One idea serves both directions.

**Sign → text.** Webcam, then MediaPipe Holistic for the landmarks, then a
segmenter that reads wrist speed to find where one sign starts and ends, then
the classifier over the held frames, then ISL gloss rewritten into an English
sentence for staff.

**Text → sign.** Staff text is reordered into ISL grammar — time at the front of
the clause, question words at the end — resolved to a stored pose track per
sign, then played with a held peak and a blended transition into the next sign.

That hold matters more than it sounds. A sign has four phases: preparation,
stroke, **hold**, transition. The hold is where the meaning is read. Motion that
flows straight through the peak looks fluent and is unreadable, which is the
most common defect in signing avatars.

The face channel is kept for the same reason. In ISL the face carries grammar,
not decoration: a raised brow marks a yes/no question, a furrowed brow marks a
wh-question, a headshake carries negation. A system tracking only hands can read
every word of a sentence and still not know it was a question.

---

## Stack

| Layer | Technology |
|---|---|
| Interface | React 18, TypeScript, Vite |
| Styling | Tailwind CSS v4, self-hosted type |
| Motion | GSAP, Motion, Lenis |
| Landmarks | MediaPipe Holistic (WASM, served locally) |
| Recognition | TensorFlow.js |
| Avatar | Three.js, `@pixiv/three-vrm` |
| Transcript | Node, SQLite |

---

## Running it

```bash
cd app
npm install
npm run dev
```

The dev server listens on `127.0.0.1:5300`.

| Command | What it does |
|---|---|
| `npm run dev` | dev server with hot reload |
| `npm run build` | production build into `app/dist` |
| `npm run preview` | serve the production build |
| `npm run check` | TypeScript, no emit |

---

## Repository

```
app/
  index.html
  src/
    pages/          screens — landing, and the product surfaces
    components/ui/  presentation components
    lib/            the pipeline — gloss, pose, segmenter, classifier
    styles/         design tokens and per-screen styling
  public/
    brand/          logo lockups
    fonts/          self-hosted type, so nothing loads from a CDN
server/             local transcript service
```

Vocabulary, Archive and Settings are listed in the navigation and are still in
development; the landing page and the Counter are the built surfaces.

---

## Typefaces

Clash Display and Switzer (Indian Type Foundry), Anek Devanagari (Ek Type),
DM Mono (Colophon). All self-hosted — a terminal meant to run offline on a
counter's own machine cannot reach a font CDN.
