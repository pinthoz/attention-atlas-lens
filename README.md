# Attention Atlas Lens

A single-page tool for reading attention inside BERT and GPT-2: pick a layer
and head from a 12 × 12 index, and see where every token looks.

Next.js (App Router), TypeScript, Tailwind. No component library, no state
management library, no route handlers.

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
```

The API base URL comes from `NEXT_PUBLIC_API_URL` (see `.env.example`). It is
read at build time, so a deployment needs it set in the build environment, not
at runtime.

```bash
NEXT_PUBLIC_API_URL=https://<space>.hf.space npm run build   # emits out/
```

### The API it expects

This frontend talks to the JSON API in the `attention-atlas` repository
(`api.py`, run with `uvicorn api:api --port 8000`). It uses four endpoints:
`GET /api/health`, `GET /api/models`, `POST /api/analyze` and
`POST /api/bias`.

`POST /api/bias` was added for this frontend. It runs GUS-Net over the text and
crosses the per-token labels with each head's attention, returning the token
labels plus a `[layer][head]` grid of BAR (attention to flagged words over what
an even spread would give) and BSR (flagged words attending to each other).
Both are centred at **1.0, not 0**, 1.0 means no preference either way.

It is a separate request from `/api/analyze` on purpose: it is a second forward
pass through a different model, and the attention view should not wait for it.
The page fires both and renders whichever arrives first.

`POST /api/faithfulness` was added too. It ranks heads by their bias ratio,
zero-ablates the top ones with `batch_ablate_top_heads`, and reports how far
the model's representation moves without each, the check that separates a head
*looking* at a stereotype from the model *depending* on it. Attention is only
evidence; this is the part that tests it.

Unlike everything else on the page, it is **never fired automatically**: it
costs a forward pass per head on top of the bias analysis, so it runs on a
button and the result is discarded when the sentence or model changes.

The same endpoint also returns **Integrated Gradients** correlations: how
closely each head's attention agrees with the tokens the gradient says the
decision rests on. Ablation and IG are independent signals and can disagree,
which is why both are shown.

Three caveats there are required by the pipeline's own docstrings, and each
governs what the numbers may be used for:

- **Significance uses `spearman_qvalue`, never `spearman_pvalue`.** One test
  runs per head across ~144 heads, so roughly seven raw p < 0.05 hits are
  expected from noise. The panel shows only q, and says why.
- **The attribution target decides whether any of it validates the bias
  reading.** `gusnet-bias-logits` attributes the detector's own evidence, but
  only when the attention comes from the GUS-Net trunk, i.e. when the analysed
  model is a `pinthoz/gus-net-*` id. For a plain encoder the attentions belong
  to the pretrained model while the gradients would flow through the fine-tuned
  one, so the target falls back to `pooled-norm`, which does **not** validate
  the bias explanations. The panel states which it got and what that costs.
- **`convergence_delta` above ~0.05** means the path integral has not
  converged and every correlation is approximate. Step count follows the
  dashboard: 64 for the bias target (its sigmoid sum saturates; residual ~68%
  at 30 steps against ~3% at 64), 30 otherwise.

Two things the ablation panel says out loud, because the numbers mislead
without them:
the impacts are tiny (heads are largely redundant, the model routes around a
missing one), so they are a ranking rather than a share of behaviour; and
zero-ablation pushes activations off the training manifold and tends to
**overstate** damage. It is used because the published thresholds were
calibrated on it, and `ablation_mode` is returned so the reading is never
ambiguous.

**The API is not currently deployed.** At the time of writing, `api.py` and
`attention_app/serialize.py` are untracked in `attention-atlas`, and
`https://pinthoz-attention-atlas.hf.space/api/*` returns 404, the Space serves
only the Shiny dashboard. Until those files are committed and the Space
redeploys, point `NEXT_PUBLIC_API_URL` at a locally running instance.

The service allows `http://localhost:3000` by default and one more origin
through its own `FRONTEND_ORIGIN` variable, which has to name the deployed
frontend or the browser will refuse the request.

### If most models fail to load locally

`GET /api/models` lists everything `ModelManager` accepts, but a model only
runs once its weights are on the machine. If a model that is not cached fails
with a certificate error in the service log, Python cannot verify Hugging
Face's TLS chain even though the network itself is fine, `curl` succeeding
while `transformers` fails is the signature. Fix it on the service side (a
current `certifi`, `truststore`, or `SSL_CERT_FILE` pointing at the right CA
bundle); nothing in this frontend can work around it.

The model picker marks which models the service currently holds in memory,
using `models_loaded` from `/api/health`, so a slow or unavailable choice is
visible before it is made rather than after it fails.

## Why the browser calls the API directly

There are no Next.js route handlers proxying to the Space, and that is
deliberate. The Space sleeps when idle, and the first request after it wakes
can take 30-60 seconds, longer than a Vercel Hobby function may run. A proxy
would convert a slow-but-successful request into a hard timeout. A browser
fetch simply waits.

It also means the whole site is a static export (`output: "export"`): no
serverless functions at all. The cost is CORS, which the service is configured
for, and a first-load experience that has to be honest about waiting. The page
pings `/api/health` on mount to start waking the Space, and after three seconds
of waiting it explains what is happening instead of showing a spinner that
looks broken.

## Things that are easy to get wrong

These are handled deliberately; changing them needs care.

- **`balance` is `null` for GPT-2.** GPT-2 has no `[CLS]` token, so the
  quantity is undefined rather than zero. It renders as `N/A` with an
  explanation, and the head index says so instead of shading everything one
  colour. Rendering it as `0` would claim a head ignores a token that was never
  in the sentence.
- **The causal mask is not zero attention.** GPT-2's matrix is
  lower-triangular, and the API sends masked cells as `0.0`, numerically
  identical to a genuine zero. The mask is therefore derived structurally
  (`col > row` when `is_causal`) and drawn as hatched page, a texture no real
  value can have. Conflating the two is a real interpretability error.
- **`attention` only ships when both `layer` and `head` are sent.** The server
  omits the matrix otherwise to keep the payload small, so the client always
  sends both.
- **`uniformity` is a standard deviation**, so a higher value means *less*
  uniform. **`focus_normalized` is an entropy**, so higher means *more* spread
  out. Both names point the opposite way from their numbers, and the
  definitions panel says so.
- **The head index is shaded per-run**, against the minimum and maximum in that
  response, not an absolute scale. The legend states this.
- **`/api/bias` tokenizes differently from `/api/analyze`.** The analysis
  endpoint runs `tokenize_with_segments`, which encodes a multi-sentence BERT
  input as a sentence *pair* and gains a second `[SEP]`; the bias endpoint
  tokenizes plainly, because GUS-Net does. Bias labels are positional, so the
  bias card renders from `bias.tokens` and never from `analysis.tokens` -
  borrowing the other list slides every label one place from the second
  sentence onward. The endpoint also compares the two token sequences itself
  and returns 409 rather than emitting indices it cannot vouch for.
- **Bias needs a matching tokenizer.** `BASE_TO_GUSNET` in `api.py` only pairs
  models that share a vocabulary. `bert-base-multilingual-uncased` is
  deliberately absent and returns a 400 explaining why; pairing it would map
  labels onto the wrong words silently.
- **No flagged tokens means `metrics: []`**, not a grid of zeros. With nothing
  flagged there is no ratio to compute, and the card says the detector found
  nothing rather than showing 0.00×.
- **Head traits are shown as z-scores, not as their raw values.** The raw
  `clusters[].metrics` saturate: in a typical run a dozen of the 144 heads sit
  at a flat `1.0` on `semantics`. Drawing a bar from that reads "100%" for a
  head barely above average and contradicts its own family name. The panel uses
  `z_metrics` so the bar answers "how unusual is this head here", diverging
  from 0σ, with the raw value kept only as a fallback.
- **Head families are per-run.** They come from clustering this run's
  behaviour, so `cluster` indices can permute between runs, anything keyed on
  a family keys on `cluster_name`, never on the integer. The copy says the
  families describe this sentence and model rather than being fixed labels.
- **Role shading is categorical.** Everywhere else on the page colour encodes
  magnitude; when the index is shaded by family the caption says the hues rank
  nothing, and the magnitude legend is hidden rather than left showing a range
  that no longer applies.
- **Family names are generated, not enumerated.** The server builds them as
  `get_dim_name(dominant_dim) + " Specialists"`, plus combined `"X/Y"` forms on
  collision, so "Long-Range Specialists", "Syntactic Specialists" and others
  appear depending on the sentence. `buildRoles()` therefore assigns palette
  slots to whatever names come back, ordered by name so colour follows the
  family rather than its head count. Hardcoding a list of five was a real bug:
  every unlisted family fell through to the same grey and became
  indistinguishable from the next one.
- **The bias ratio is diverging, not sequential.** BAR is centred on 1.0, the
  share an even spread would give the flagged words, so shading it uses two
  hues with a neutral grey at 1.0. A sequential ramp would bury the midpoint
  inside a gradient and imply low values are merely "less of the same thing".
  The layer chart baselines on 1.0 for the same reason, not on zero.

## Design

The look follows the Attention Atlas dashboard so the two surfaces read as one
product, but the layout is an ordinary site rather than the dashboard's
sidebar: a navy header bar, then a centred column of cards.

Tokens are taken from `attention_app/ui/styles.py`, not approximated, pink
`#ff5ca9`, navy `#0f172a`, canvas `#f0f4f8`, cards at 16px radius with
`0 1px 3px rgb(0 0 0 / .05), 0 1px 2px rgb(0 0 0 / .1)`, pill controls at
`9999px`, and the dashboard's own type stack (Inter for the interface, Space
Grotesk for card titles, JetBrains Mono for tokens and figures, Outfit for the
pills).

`public/logo.png`, `public/icon.png` and `public/favicon.ico` come from
`attention-atlas/static/favicon.ico`. That file holds a single 500 × 500 frame
at ~266 KB, so it is resampled here rather than copied: a 256px PNG for the
header and a normal 16/32/48 `.ico` for the tab. Regenerate them from the
source if the mark ever changes.

## The views

| View | The question it answers | Form |
|---|---|---|
| Token ribbon | Where does *this* word look? | Sentence painted with one matrix row |
| Attention matrix | Every word against every word | Canvas heatmap |
| Which words draw the attention | What does the head point *at*? | Ranked horizontal bars |
| Every head (12 × 12) | Where in the stack is this behaviour? | DOM grid, shaded by metric or family |
| The map of heads | Which heads behave alike? | SVG scatter over t-SNE coordinates |
| … through the layers | Does this change with depth? | Line with a min-max spread band |
| The strongest links | What does this head actually connect? | Ranked pair list |
| Bias focus through the layers | Where in the model does bias attention peak? | Diverging area around 1.0× |
| Does it actually matter? | Does the output *depend* on those heads? | Ranked ablation table, on demand |
| Between the sentences | How do the sentences attend to each other? | Pooled sentence matrix |
| Bias in this sentence | What did the detector flag, and does this head care? | Marked sentence + two ratios |

Two of these deserve a note on what they are *not*. The head map's axes carry
no meaning, t-SNE preserves distances, not directions, so no ticks or
gridlines are drawn and the caption says why. The depth profile shows one
measure on one axis; the bias ratio is deliberately not overlaid on a second
y-scale, which would invite reading a crossing point that means nothing.

"Which words draw the attention" averages each column over the rows that could
reach it rather than summing. Under a causal mask a late token is visible to
fewer rows, and a raw sum would rank early tokens highest purely because more
rows were allowed to see them.

## Colour

The attention matrix uses **magma**: perceptually uniform, monotonic in
lightness, and safe under colour-vision deficiency. In a tool whose purpose is
reading magnitude off colour, a rainbow ramp would invent banding where the
data is smooth, a substantive error, not a matter of taste.

The layer × head index uses a separate single-hue indigo ramp. Keeping it
monochrome means chromatic colour on this page always means "attention weight"
and never anything else.

Head families are categorical, so they get a **validated** categorical palette
rather than a chosen-by-eye one. The four named families use Okabe-Ito hues
checked with a palette validator under all-pairs comparison, the right mode
for a scatter, where any family can land beside any other:

```
worst pair, all pairs   #D55E00 vs #009E73   ΔE 11.0 (deutan)
normal-vision floor     #D55E00 vs #E69F00   ΔE 15.6
```

The first attempt (blue `#3b82f6` + violet `#8b5cf6`) failed outright: ΔE 1.3
under deuteranopia and 12.0 even with full colour vision, for the two families
it matters most to tell apart. The amber sits below 3:1 on white, which
obliges visible relief, so every chart using these ships a labelled legend and
the scatter adds shape on top of colour. "Diffuse/Noise" is the one deliberate
neutral, it is the largest family and means "no distinctive behaviour", so it
reads as background rather than competing as a fifth category.

One rule keeps the brand palette from corrupting the data: **the interface may
use the brand colours anywhere except inside the matrix.** Annotations drawn
over the matrix, currently just the sentence-pair boundary, use blue
`#3b82f6`, and blue is chosen precisely because magma runs black → purple →
magenta → orange → cream and never passes through it. Brand pink would sit
close to real magma values near the middle of the scale, so a pink line across
the matrix could be misread as a weight. The legend swatch and the ribbon's
`B` badge use the same blue as the line, so the annotation reads as one thing
in three places.

## Canvas and SVG

Both, for opposite reasons.

The **attention matrix is canvas**. At the API's 100-token ceiling it is 10,000
cells; in SVG that is 10,000 DOM nodes to reconcile, lay out and keep in the
accessibility tree. SVG's main advantage, free hit-testing, is worth almost
nothing here, because the grid is uniform and hit-testing collapses to
`floor((y - marginTop) / cellSize)`. Cells are painted once to an offscreen
canvas and blitted on pointer moves, so hovering never repaints the matrix.

The **head index is DOM buttons**. 144 nodes is cheap, and every cell there is a
real control that wants a label and a focus ring. Tabbing through 144 stops
would be hostile, so it uses a roving tabindex: one stop to enter, arrow keys
inside.

Canvas is opaque to a screen reader, so the matrix is not the only way to read
the data: the token ribbon is real DOM text carrying the selected row, the
readout is an `aria-live` region, and the matrix takes arrow keys with Enter to
pin a row.

## Layout

`src/lib` holds the API client, hand-written types, colour ramps, token
parsing, metric definitions and copy, error rewriting, and URL state.
`src/components` holds the five pieces of the interface. `src/app/page.tsx`
orchestrates them.

Sentence, model, layer, head and metric all live in query parameters, so any
view is a link. Clicking through heads uses `replaceState`, so the back button
does not fill up.
