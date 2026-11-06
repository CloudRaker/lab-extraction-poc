# Third-party UI code

The app uses only free Arc items and open source packages. It uses no Arc Pro item.

## Arc components

Arc (https://uiarc.dev) free items are open source under the MIT license,
Copyright (c) 2026 Elia Kuratli. The shadcn CLI copied the items into
`src/components/arc/`. Some CSS and token files in this repo have fewer comments
than the registry copy. The full license text is at the end of this file and in
`src/components/arc/LICENSE`.

Install command:

```sh
pnpm dlx shadcn@latest add @uiarc/<id>
```

| Item | Tier | License | Used for |
| --- | --- | --- | --- |
| `arc-foundation` | free | MIT | Design tokens, light and dark themes |
| `arc-motion-tokens` | free | MIT | Motion presets (installed by the items below) |
| `alert` | free | MIT | Sample notes and errors |
| `animated-counter` | free | MIT | Credit count-up |
| `badge` | free | MIT | Language, flags and status labels |
| `button` | free | MIT | Run live, zoom and retry actions |
| `dialog` | free | MIT | Demo code prompt |
| `input` | free | MIT | Demo code field |
| `json-viewer` | free | MIT | Raw JSON view |
| `segmented-control` | free | MIT | Table and JSON switch |
| `skeleton` | free | MIT | Loading states |
| `stepper` | free | MIT | Live run steps |
| `theme-switch` | free | MIT | Light and dark switch |
| `tooltip` | free | MIT | Check details on a result row |

## Packages these components need

| Package | License |
| --- | --- |
| `motion` | MIT |
| `tw-animate-css` | MIT |
| `@radix-ui/react-dialog` | MIT |
| `@radix-ui/react-tooltip` | MIT |
| `lucide-react` | ISC |
| `pdfjs-dist` (renders an uploaded PDF in the browser) | Apache-2.0 |
| `@fontsource-variable/geist` (Geist font) | OFL-1.1 |
| `@fontsource-variable/inter` (Inter font) | OFL-1.1 |

## Sample pages

The pages in `public/samples/` come from
[cloudraker-synthdocs](https://github.com/CloudRaker/cloudraker-synthdocs), licensed
under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
The app stores JPEG copies and small thumbnails of these pages, next to the
original WebP files.

## Arc MIT license

```text
MIT License

Copyright (c) 2026 Elia Kuratli

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
