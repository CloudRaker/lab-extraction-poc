// Reads a file the user picked, in the browser. A PDF becomes page images with pdf.js, so the
// page viewer can draw citation boxes the same way as on the samples. Nothing here leaves the
// browser until the user starts a run.

import { MAX_UPLOAD_BYTES, MAX_UPLOAD_PAGES } from '@/shared/contract'

export interface PageImage {
  url: string // blob URL, for this session only
  width: number
  height: number
}

export interface UploadedFile {
  file: File
  name: string
  pages: PageImage[]
  scanned: boolean // no text layer, so parsing runs OCR
}

export const UPLOAD_ACCEPT = '.pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg'
const PDF_WIDTH = 1400

function kindOf(file: File): 'pdf' | 'image' | null {
  const name = file.name.toLowerCase()
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf'
  if (file.type === 'image/png' || file.type === 'image/jpeg' || /\.(png|jpe?g)$/.test(name)) return 'image'
  return null
}

async function readImage(file: File): Promise<PageImage> {
  const url = URL.createObjectURL(file)
  const img = new Image()
  img.src = url
  try {
    await img.decode()
  } catch {
    URL.revokeObjectURL(url)
    throw new Error('This image did not open. Check the file and try again.')
  }
  return { url, width: img.naturalWidth, height: img.naturalHeight }
}

async function readPdf(file: File): Promise<{ pages: PageImage[]; scanned: boolean }> {
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ])
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const task = pdfjs.getDocument({ data: await file.arrayBuffer() })
  let doc
  try {
    doc = await task.promise
  } catch (e) {
    throw new Error(
      e instanceof Error && e.name === 'PasswordException'
        ? 'This PDF has a password. Remove the password and try again.'
        : 'This PDF did not open. Check the file and try again.',
    )
  }
  try {
    if (doc.numPages > MAX_UPLOAD_PAGES) {
      throw new Error(`This PDF has ${doc.numPages} pages. The limit is ${MAX_UPLOAD_PAGES}.`)
    }
    const pages: PageImage[] = []
    let textItems = 0
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n)
      textItems += (await page.getTextContent()).items.length
      const scale = PDF_WIDTH / page.getViewport({ scale: 1 }).width
      const viewport = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      await page.render({ canvas, viewport }).promise
      const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/jpeg', 0.85))
      if (!blob) throw new Error('This PDF did not open. Check the file and try again.')
      pages.push({ url: URL.createObjectURL(blob), width: canvas.width, height: canvas.height })
    }
    return { pages, scanned: textItems === 0 }
  } finally {
    await task.destroy()
  }
}

/** Checks the file and renders its pages. Throws an Error with a message for the user. */
export async function readUpload(file: File): Promise<UploadedFile> {
  const kind = kindOf(file)
  if (!kind) throw new Error('Choose a PDF, PNG or JPEG file.')
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`This file is too large. The limit is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`)
  }
  if (kind === 'image') return { file, name: file.name, pages: [await readImage(file)], scanned: true }
  return { file, name: file.name, ...(await readPdf(file)) }
}

export function releaseUpload(upload: UploadedFile) {
  for (const p of upload.pages) URL.revokeObjectURL(p.url)
}
