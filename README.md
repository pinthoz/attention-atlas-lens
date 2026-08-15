# Attention Atlas Lens

A single-page tool for reading attention inside BERT and GPT-2: pick a layer and
head from a 12 × 12 index, and see where every token looks.

**[attention-atlas-lens.vercel.app](https://attention-atlas-lens.vercel.app)**

Beyond the attention itself, the page crosses each head against the tokens a
bias detector flagged, and can test whether the model actually *depends* on the
heads that look at them, by ablating them and by comparing their attention with
integrated gradients.

Next.js (App Router), TypeScript, Tailwind. No component library, no state
management library, no route handlers.

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
```

You also need the API, which lives in the
[attention-atlas](https://github.com/pinthoz/attention-atlas) repository:

```bash
uvicorn service.api:api --port 8000
```

The base URL comes from `NEXT_PUBLIC_API_URL` (see `.env.example`). It is read
at **build** time, so a deployment needs it set in the build environment, not
afterwards:

```bash
NEXT_PUBLIC_API_URL=https://pinthoz-attention-atlas.hf.space npm run build
```

The site is a static export, so the browser calls the API directly. That means
the service has to allow this origin: set `FRONTEND_ORIGIN` on the Space to the
deployed URL. `http://localhost:3000` is always allowed.

## What it shows

| View | The question it answers |
|---|---|
| Token ribbon | Where does *this* word look? |
| Attention matrix | Every word against every word |
| Which words draw the attention | What does the head point *at*? |
| Every head (12 × 12) | Where in the stack is this behaviour? |
| The map of heads | Which heads behave alike? |
| … through the layers | Does this change with depth? |
| The strongest links | What does this head actually connect? |
| Between the sentences | How do the sentences attend to each other? |
| Bias in this sentence | What did the detector flag, and does this head care? |
| Bias focus through the layers | Where in the model does bias attention peak? |
| Does it actually matter? | Does the output *depend* on those heads? |

Sentence, model, layer, head and metric all live in query parameters, so any
view is a link.

## Layout

`src/lib` holds the API client, types, colour ramps, token parsing, metric
copy, error rewriting and URL state. `src/components` holds the pieces of the
interface. `src/app/page.tsx` orchestrates them.

## Design notes

Several things here are deliberate and easy to undo by accident: the causal
mask is drawn as texture rather than as zero attention, head families are
per-run and never keyed on their integer, the bias ratio is centred on 1.0 and
shaded diverging, the matrix is canvas while the head index is DOM, and the
categorical palette was validated for colour-vision deficiency rather than
picked by eye.

The reasoning for all of it is in **[docs/design-notes.md](docs/design-notes.md)**.
Worth reading before changing a chart.
