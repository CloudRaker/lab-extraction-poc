# Lab report extraction

A proof of concept that reads lab reports with the CloudRaker paperwork API.
It classifies each page, then extracts the patient details and every result
row of a lab report. Each value links to its place on the page.

The app is one Cloudflare Worker: a TanStack Start single-page app and a small
Hono API. The browser calls only `/api/*` on the same origin. The worker holds
the API key.

## What it shows

1. Upload the page image to the paperwork API (`POST /v1/files`). The API
   parses it with OCR (rakedoc).
2. Classify the page (`POST /v1/classify`): `lab_report`, `prescription`,
   `consult_note`, `discharge_summary` or `other`.
3. If the page is a lab report, extract it (`POST /v1/extract`) with a JSON
   Schema, citations and a judge pass that scores each cited value.
4. Compare the result with the ground truth of the sample.
5. Estimate the credits from the run usage and the Pro plan rate card.

The app has 13 synthetic samples: 10 lab reports (clean, scanned, faxed, phone
photo, crumpled, coffee stain, in French and English) and 3 other documents.
Each sample opens on a saved run. **Run live** runs it again.

Point at a field or a row to see its citation on the page. The API cites tables,
not single rows, so a row shows the box of its table. The caption says how sure
this link is.

The schema and the classes are in `src/shared/lab-schema.ts`.

## Run it locally

You need Node 22 or later and pnpm.

```sh
pnpm install
cat > .dev.vars <<'EOF'
PAPERWORK_API_KEY=your_paperwork_api_key
# DEMO_CODE=choose_a_code   # optional: live runs then ask for this code
EOF
pnpm dev                    # http://localhost:5173
```

Saved results show without a key. A live run needs the key. Do not commit
`.dev.vars`. Git ignores it, and `pnpm build` removes the copy that Vite puts in
`dist/`. For this reason, `pnpm preview` has no key and cannot do live runs.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Starts the app with the worker on Vite. |
| `pnpm test` | Runs the unit tests. |
| `pnpm typecheck` | Checks the types. |
| `pnpm lint` | Runs oxlint on the app code. |
| `pnpm build` | Builds the app and the worker. |
| `pnpm run-samples [id ...]` | Runs the samples live and writes `public/samples/results/<id>.json`. All 13 samples use about 510 credits. |
| `pnpm run-samples --rescore` | Scores the saved results again. It makes no API calls. |
| `pnpm deploy` | Builds and deploys the worker. |

Saved results do not keep the file ids or the run ids of the API.

## Deploy

```sh
pnpm wrangler secret put PAPERWORK_API_KEY
pnpm wrangler secret put DEMO_CODE
pnpm deploy
```

Live runs spend credits, so they are closed by default:

- With `DEMO_CODE`, `POST /api/run` and `POST /api/run/stream` need the header
  `x-demo-code`.
- Without `DEMO_CODE`, a deployed worker refuses live runs and shows only saved
  results. On `localhost`, live runs stay open.
- Each IP address can start 5 runs per minute. Change this in `wrangler.jsonc`.

## API

| Route | Returns |
| --- | --- |
| `GET /api/config` | Rate card, credit price, and whether live runs are off or need a code. |
| `GET /api/samples` | The sample list. |
| `GET /api/samples/:id/image` | The page image (WebP). |
| `GET /api/samples/:id/result` | The saved result of the sample. |
| `POST /api/run` | A live run: `{ "sampleId": "..." }`. |
| `POST /api/run/stream` | The same live run as NDJSON: one event per step, then the result. The app uses this route. |
| `POST /api/upload/stream` | A live run on your own file: multipart form with `file` (PDF, PNG or JPEG, 15 MB and 5 pages at most), `pages` and `scanned`. Same demo code check and same events. The result has no score. |

The types are in `src/shared/contract.ts`.

## Your own file

When live runs are on, the page shows **Upload your file**. The browser renders the pages with pdf.js and sends nothing until you press **Run live** and enter the demo code. The worker keeps no copy and sends the API a generic file name. It asks the API to delete the file after the run, and run data expires after one hour. Use test or de-identified documents only.

A file has no ground truth, so the results have no checks. The extraction schema holds one report for each file, so split a PDF that holds several reports. A scanned PDF is counted as OCR because it has no text layer. The API does not report which one ran, so this is an estimate.

## How credits are computed

Runs report usage in pages, not credits. The app computes the cost from the Pro
plan rate card at `https://catalog.cloudraker.com/catalog.json`, and uses built-in
rates when the catalog is not available. The panel shows each event, its rate, the
reason it counts, and whether the rates are live. The total is an estimate at list
price: it is not read from a billing record.

One image page, with the rates on 2026-11-06, at $0.001 per credit:

| Event | Credits | Why |
| --- | --- | --- |
| `page_ocr` | 10 | The page is an image, so parsing runs OCR. |
| `page_classified` | 10 | The page goes to the classifier. |
| `page_extracted` | 15 | The page goes to the extraction (lab reports only). |
| `extraction_grounding` | 5 | Citations are on (lab reports only). |
| `page_judged` | 5 | The judge pass is on (lab reports only). |

A lab report costs 45 credits. Any other document costs 20 credits. The app takes
the page count from the classify run. This is correct for the one-page samples.

## How the score works

Each sample has `page_md`, the exact markdown that the page was made from. The app
reads the results tables and the patient fields from it. The code is in
`src/shared/score.ts`.

Rows pair in this order:

1. Exact test name, after the app folds case, accents and punctuation.
2. One name contains the other. Names need at least 4 characters.
3. A small edit distance, for a misread name. Names need at least 4 characters.
4. Position. Between two paired rows, a gap with the same number of rows on both
   sides pairs in order, if the value matches or the name is at least half right.

Each pair checks the name, value, flag, units and reference range. A green check
means that all five match. A warning or a cross says what the source has. Values
accept a decimal comma. A range can keep its units.

The panel also counts the patient and report fields that the page prints. The
judge confidence comes from the API. It is not a check against the source, and a
misread value can have a high confidence.

## Samples

The sample pages come from
[cloudraker-synthdocs](https://github.com/CloudRaker/cloudraker-synthdocs), a
synthetic document dataset by CloudRaker, licensed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). All names, numbers and
results on the pages are synthetic. Some synthetic pages use the names of real
laboratories and hospitals. The app changes the format of the pages, as below, and
does not change their content.

Each sample has these files in `public/samples/`:

- `<id>.webp`: the original page image, shown in the app.
- `<id>.jpg`: a JPEG copy, sent to the API (the API does not parse WebP).
- `thumbs/<id>.jpg`: a small JPEG copy for the sample list.
- `<id>.json`: the synthdocs record with the ground truth (`page_md`).
- `results/<id>.json`: the saved run.

`index.json` lists the samples. `scripts/build-index.ts` writes it.

## License

The code is MIT. See [LICENSE](LICENSE). The sample pages are CC BY 4.0.
[THIRD_PARTY.md](THIRD_PARTY.md) lists the UI components, with their licenses and
the Arc copyright notice.
