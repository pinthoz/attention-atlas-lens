# Attention Atlas — frontend

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
(`api.py`, run with `uvicorn api:api --port 8000`). It uses three endpoints:
`GET /api/health`, `GET /api/models`, `POST /api/analyze`.

**The API is not currently deployed.** At the time of writing, `api.py` and
`attention_app/serialize.py` are untracked in `attention-atlas`, and
`https://pinthoz-attention-atlas.hf.space/api/*` returns 404 — the Space serves
only the Shiny dashboard. Until those files are committed and the Space
redeploys, point `NEXT_PUBLIC_API_URL` at a locally running instance.

The service allows `http://localhost:3000` by default and one more origin
through its own `FRONTEND_ORIGIN` variable, which has to name the deployed
frontend or the browser will refuse the request.

## Why the browser calls the API directly

There are no Next.js route handlers proxying to the Space, and that is
deliberate. The Space sleeps when idle, and the first request after it wakes
can take 30–60 seconds — longer than a Vercel Hobby function may run. A proxy
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
  lower-triangular, and the API sends masked cells as `0.0` — numerically
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

## Colour

The attention matrix uses **magma**: perceptually uniform, monotonic in
lightness, and safe under colour-vision deficiency. In a tool whose purpose is
reading magnitude off colour, a rainbow ramp would invent banding where the
data is smooth — a substantive error, not a matter of taste.

The layer × head index uses a separate single-hue indigo ramp. Keeping it
monochrome means chromatic colour on this page always means "attention weight"
and never anything else.

## Canvas and SVG

Both, for opposite reasons.

The **attention matrix is canvas**. At the API's 100-token ceiling it is 10,000
cells; in SVG that is 10,000 DOM nodes to reconcile, lay out and keep in the
accessibility tree. SVG's main advantage — free hit-testing — is worth almost
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
