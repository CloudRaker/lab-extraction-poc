import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'

import { Alert } from '@/components/arc/alert/alert'
import { Button } from '@/components/arc/button/button'
import { Skeleton } from '@/components/arc/skeleton/skeleton'
import { ThemeSwitch } from '@/components/arc/theme-switch/theme-switch'
import { DemoCodeDialog, useLiveRun } from '@/components/run-live'
import { SampleRail } from '@/components/sample-rail'
import { SampleView } from '@/components/sample-view'
import { getConfig, getSamples } from '@/lib/api'
import { useTheme } from '@/lib/theme'

const DEFAULT_SAMPLE = '1002_004107'

export const Route = createFileRoute('/')({
  component: Home,
  validateSearch: (search: Record<string, unknown>): { sample?: string } =>
    typeof search['sample'] === 'string' ? { sample: search['sample'] } : {},
})

function Home() {
  const { sample: wanted } = Route.useSearch()
  const samples = useQuery({ queryKey: ['samples'], queryFn: getSamples, staleTime: Infinity })
  const config = useQuery({ queryKey: ['config'], queryFn: getConfig, staleTime: 5 * 60_000 })
  const live = useLiveRun(config.data?.demoCodeRequired ?? false)
  const { theme, setTheme } = useTheme()

  const list = samples.data ?? []
  const selected = list.find((s) => s.id === wanted) ?? list.find((s) => s.id === DEFAULT_SAMPLE) ?? list[0]

  return (
    <div className="mx-auto flex min-h-dvh max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6">
      <header className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="font-display text-2xl font-medium tracking-tight">Lab extraction</h1>
          <p className="text-sm text-secondary">
            Classify a scanned page, extract its lab results, and check each value against the source.
          </p>
          <p className="text-xs text-muted">Powered by the CloudRaker paperwork API and rakedoc.</p>
        </div>
        <ThemeSwitch theme={theme} iconOnly onThemeChange={setTheme} />
      </header>

      {samples.isError ? (
        <Alert tone="danger" title="The samples did not load">
          <div className="mt-2">
            <Button variant="secondary" size="sm" onClick={() => void samples.refetch()}>
              Load the samples again
            </Button>
          </div>
        </Alert>
      ) : null}

      {samples.isPending ? <Skeleton label="Loading the samples" lines={6} /> : null}

      {selected ? (
        <main className="grid min-w-0 flex-1 gap-6 xl:grid-cols-[212px_minmax(0,1fr)]">
          <SampleRail samples={list} selectedId={selected.id} />
          <SampleView
            key={selected.id}
            sample={selected}
            live={live.state}
            onRun={() => void live.start(selected.id)}
            onShowSaved={() => live.clearResult(selected.id)}
          />
        </main>
      ) : null}

      <footer className="border-t border-border pt-3 text-xs text-secondary">
        All pages and values are synthetic. Samples from{' '}
        <a className="underline underline-offset-2" href="https://github.com/CloudRaker/cloudraker-synthdocs">
          cloudraker-synthdocs
        </a>
        , CC BY 4.0. App code is MIT.
      </footer>

      <DemoCodeDialog need={live.state.codeNeeded} onSubmit={live.submitCode} onClose={live.closeCode} />
    </div>
  )
}
