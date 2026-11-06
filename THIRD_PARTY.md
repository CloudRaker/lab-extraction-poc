# Third-party UI code

The app uses only free Arc items and open source packages. It uses no Arc Pro item.

## Arc components

Arc (https://uiarc.dev) free items are open source under the MIT license. The
items are copied into `src/components/arc/` by the shadcn CLI, unchanged.

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
| `@radix-ui/react-dialog` | MIT |
| `@radix-ui/react-tooltip` | MIT |
| `lucide-react` | ISC |
| `@fontsource-variable/geist` (Geist font) | OFL-1.1 |
| `@fontsource-variable/inter` (Inter font) | OFL-1.1 |

## Sample pages

The pages in `public/samples/` come from
[cloudraker-synthdocs](https://github.com/CloudRaker/cloudraker-synthdocs), licensed
under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
