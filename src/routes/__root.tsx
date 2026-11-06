import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRootRoute, HeadContent, Outlet, Scripts } from '@tanstack/react-router'

import { THEME_SCRIPT } from '@/lib/theme'

import appCss from '../styles.css?url'

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } })

export const Route = createRootRoute({
  // Client-only SPA: the worker serves the shell, the browser calls /api/*.
  ssr: false,
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Lab extraction' },
      {
        name: 'description',
        content: 'Classify lab reports and extract their results with the CloudRaker paperwork API.',
      },
      { name: 'color-scheme', content: 'light dark' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  component: () => (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  ),
  shellComponent: ({ children }) => (
    <html lang="en" data-accent="blue" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  ),
})
