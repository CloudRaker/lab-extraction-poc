import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import type { SampleInfo } from '../shared/contract'

export const Route = createFileRoute('/')({ component: Home })

// Placeholder page. The real UI comes in a later stage.
function Home() {
  const [samples, setSamples] = useState<SampleInfo[] | null>(null)
  useEffect(() => {
    void fetch('/api/samples')
      .then((r) => r.json() as Promise<SampleInfo[]>)
      .then(setSamples)
  }, [])
  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-medium">Lab report extraction</h1>
      <ul className="mt-6 space-y-1 text-sm">
        {samples?.map((s) => (
          <li key={s.id}>
            {s.title} <span className="text-neutral-500">({s.id})</span>
          </li>
        ))}
      </ul>
    </main>
  )
}
