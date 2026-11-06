import { LoaderCircle, Upload } from 'lucide-react'
import { useRef, useState } from 'react'

import { Button } from '@/components/arc/button/button'
import { readUpload, UPLOAD_ACCEPT, type UploadedFile } from '@/lib/upload'

/** Picks a file and renders its pages in the browser. The run starts later, with the demo code. */
export function UploadControl({ onReady }: { onReady: (upload: UploadedFile) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [reading, setReading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pick = async (file: File | undefined) => {
    if (!file) return
    setReading(true)
    setError(null)
    try {
      onReady(await readUpload(file))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'This file did not open. Try another file.')
    } finally {
      setReading(false)
      // The same file can be picked again.
      if (input.current) input.current.value = ''
    }
  }
  return (
    <div className="flex w-52 shrink-0 flex-col gap-1 xl:w-full">
      <input
        ref={input}
        type="file"
        accept={UPLOAD_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-label="Your file"
        onChange={(e) => void pick(e.target.files?.[0])}
      />
      <Button variant="secondary" size="sm" disabled={reading} aria-busy={reading || undefined} onClick={() => input.current?.click()}>
        <span className="inline-flex items-center gap-2">
          {reading ? (
            <LoaderCircle size={14} strokeWidth={1.75} aria-hidden="true" className="motion-safe:animate-spin" />
          ) : (
            <Upload size={14} strokeWidth={1.75} aria-hidden="true" />
          )}
          {reading ? 'Reading the file' : 'Upload your file'}
        </span>
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : (
        <p className="px-1 text-xs text-secondary">Needs the demo code.</p>
      )}
    </div>
  )
}
