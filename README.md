# Lab report extraction

A proof of concept that reads lab reports with the CloudRaker paperwork API.
It classifies each page, then extracts the patient details and every result
row of a lab report. Each value links to its place on the page.

The app is one Cloudflare Worker: a TanStack Start single-page app and a small
Hono API. The browser calls only `/api/*` on the same origin. The worker holds
the API key.

## What it does

1. Upload the page image to the paperwork API (`POST /v1/files`). The API
   parses it with OCR (rakedoc).
2. Classify the page (`POST /v1/classify`): `lab_report`, `prescription`,
   `consult_note`, `discharge_summary` or `other`.
3. If the page is a lab report, extract it (`POST /v1/extract`) with a JSON
   Schema, citations and a judge pass that scores each cited value.
4. Compare the result rows with the ground truth of the sample.
5. Estimate the credits from the run usage and the Pro plan rate card.

The schema and the classes are in `src/shared/lab-schema.ts`.

## Run it locally

You need Node 22 or later and pnpm.

```sh
pnpm install
echo 'PAPERWORK_API_KEY=sk_...' > .dev.vars   # your paperwork API key
pnpm dev                                      # http://localhost:5173
```

Saved results show without a key. A live run needs the key.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Starts the app with the worker on Vite. |
| `pnpm test` | Runs the unit tests (ground-truth parsing and scoring). |
| `pnpm typecheck` | Checks the types. |
| `pnpm run-samples [id ...]` | Runs the samples live and writes `public/samples/results/<id>.json`. |
| `pnpm deploy` | Builds and deploys the worker. |

## Deploy

```sh
pnpm wrangler secret put PAPERWORK_API_KEY
pnpm wrangler secret put DEMO_CODE   # optional: protects live runs
pnpm deploy
```

When `DEMO_CODE` is set, `POST /api/run` needs the header `x-demo-code`.
Saved results stay public.

## API

| Route | Returns |
| --- | --- |
| `GET /api/config` | Rate card, credit price, and whether live runs need a code. |
| `GET /api/samples` | The sample list. |
| `GET /api/samples/:id/image` | The page image (WebP). |
| `GET /api/samples/:id/result` | The saved result of the sample. |
| `POST /api/run` | A live run: `{ "sampleId": "..." }`. |

The types are in `src/shared/contract.ts`.

## Credits

Runs report usage in pages, not credits. The app computes the cost from the
Pro plan rate card at `https://catalog.cloudraker.com/catalog.json`, and uses
built-in rates when the catalog is not available. For one image page:

| Event | Why |
| --- | --- |
| `page_ocr` | The page is an image, so parsing runs OCR. |
| `page_classified` | The page goes to the classifier. |
| `page_extracted` | The page goes to the extraction (lab reports only). |
| `extraction_grounding` | Citations are on. |
| `page_judged` | The judge pass is on. |

## Samples

The sample pages come from
[cloudraker-synthdocs](https://github.com/cloudraker/cloudraker-synthdocs),
a synthetic document dataset by CloudRaker, licensed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). All names, numbers
and results on the pages are synthetic. Each page has its exact markdown, which
the app uses as ground truth.

Each sample has three files in `public/samples/`:

- `<id>.webp`: the original page image, shown in the app.
- `<id>.jpg`: the same image as JPEG, sent to the API (the API does not parse WebP).
- `<id>.json`: the synthdocs record with the ground truth (`page_md`).

`index.json` lists the samples. `scripts/build-index.ts` writes it.

## License

MIT. See [LICENSE](LICENSE). The sample pages are CC BY 4.0.
