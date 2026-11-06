// Worker entry (wrangler `main`). /api/* goes to the Hono app. Everything else
// is a static asset, or the TanStack Start SPA shell.

import serverEntry from '@tanstack/react-start/server-entry'
import { Hono } from 'hono'

import api from './api/app'

// serverEntry types fetch(request) only, but it accepts (request, env, ctx).
const entry = serverEntry as unknown as Required<Pick<ExportedHandler<CloudflareBindings>, 'fetch'>>

const server = new Hono<{ Bindings: CloudflareBindings }>()

server.route('/', api)

server.all('*', async (c) => {
  const assetResponse = await c.env.ASSETS.fetch(c.req.raw)
  if (assetResponse.status !== 404) return new Response(assetResponse.body, assetResponse)
  return entry.fetch(c.req.raw as Parameters<typeof entry.fetch>[0], c.env, c.executionCtx as ExecutionContext)
})

export default server
