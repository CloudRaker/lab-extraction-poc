import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useMemo, useRef, useState } from 'react'

import { Alert } from '@/components/arc/alert/alert'
import { Button } from '@/components/arc/button/button'
import { Skeleton } from '@/components/arc/skeleton/skeleton'
import { ThemeSwitch } from '@/components/arc/theme-switch/theme-switch'
import { DemoCodeDialog, UPLOAD_ID, useLiveRun } from '@/components/run-live'
import { SampleRail } from '@/components/sample-rail'
import { SampleView } from '@/components/sample-view'
import { UploadControl } from '@/components/upload-control'
import { getConfig, getSamples } from '@/lib/api'
import { useTheme } from '@/lib/theme'
import { releaseUpload, type UploadedFile } from '@/lib/upload'

import type { SampleInfo } from '@/shared/contract'

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
  const navigate = Route.useNavigate()
  const [upload, setUpload] = useState<UploadedFile | null>(null)
  const uploads = useRef(0) // a new file gets a fresh view
  const uploadSample = useMemo<SampleInfo | null>(
    () =>
      upload && {
        id: UPLOAD_ID,
        title: upload.name,
        lang: 'en',
        preset: '',
        doctype: 'upload',
        file: '',
        mime: upload.file.type,
        image: '',
        width: upload.pages[0]?.width ?? 1,
        height: upload.pages[0]?.height ?? 1,
        hasResult: false,
      },
    [upload],
  )
  const onUpload = (next: UploadedFile) => {
    if (upload) releaseUpload(upload)
    uploads.current += 1
    live.clearResult(UPLOAD_ID)
    setUpload(next)
    void navigate({ search: { sample: UPLOAD_ID }, replace: true, resetScroll: false })
  }

  const showUpload = wanted === UPLOAD_ID && !!uploadSample
  const selected = showUpload
    ? uploadSample
    : (list.find((s) => s.id === wanted) ?? list.find((s) => s.id === DEFAULT_SAMPLE) ?? list[0])

  return (
    <div className="mx-auto flex min-h-dvh max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6">
      <header className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="font-display text-2xl font-medium tracking-tight">Lab extraction</h1>
          <p className="text-sm text-secondary">
            Classify a scanned page, extract its lab results, and check each value against the source.
          </p>
          <p className="text-xs text-secondary">Powered by the CloudRaker paperwork API and rakedoc.</p>
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
          <SampleRail
            samples={list}
            selectedId={selected.id}
            top={
              config.data && !config.data.liveRunsOff ? (
                <div className="flex shrink-0 flex-col gap-1 xl:shrink">
                  <UploadControl onReady={onUpload} />
                  {upload ? (
                    <Link
                      to="/"
                      search={{ sample: UPLOAD_ID }}
                      replace
                      resetScroll={false}
                      aria-current={showUpload ? 'page' : undefined}
                      className={`flex w-52 items-center gap-2 rounded-2xl p-1.5 transition-colors xl:w-full ${
                        showUpload ? 'bg-accent-subtle' : 'hover:bg-surface-muted'
                      }`}
                    >
                      <img
                        src={upload.pages[0]?.url}
                        alt=""
                        className="h-[46px] w-9 shrink-0 rounded-md border border-border bg-surface-muted object-cover"
                      />
                      <span className="truncate text-sm font-medium">{upload.name}</span>
                    </Link>
                  ) : null}
                </div>
              ) : null
            }
          />
          <SampleView
            key={showUpload ? `${UPLOAD_ID}:${uploads.current}` : selected.id}
            sample={selected}
            upload={showUpload ? upload : null}
            live={live.state}
            liveRunsOff={config.data?.liveRunsOff ?? false}
            onRun={() => void live.start(selected.id, showUpload && upload ? upload : undefined)}
            onShowSaved={() => live.clearResult(selected.id)}
          />
        </main>
      ) : null}

      <footer className="border-t border-border pt-3 text-xs text-secondary">
        All sample pages and values are synthetic. Samples from{' '}
        <a className="underline underline-offset-2" href="https://github.com/CloudRaker/cloudraker-synthdocs">
          cloudraker-synthdocs
        </a>
        ,{' '}
        <a className="underline underline-offset-2" href="https://creativecommons.org/licenses/by/4.0/">
          CC BY 4.0
        </a>
        . App code is MIT.
      </footer>

      <DemoCodeDialog need={live.state.codeNeeded} onSubmit={live.submitCode} onClose={live.closeCode} />
    </div>
  )
}
