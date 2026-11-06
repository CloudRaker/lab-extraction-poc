import { createRootRoute, HeadContent, Outlet, Scripts } from '@tanstack/react-router'

import appCss from '../styles.css?url'

export const Route = createRootRoute({
  // Client-only SPA: the worker serves the shell, the browser calls /api/*.
  ssr: false,
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Lab report extraction' },
      {
        name: 'description',
        content: 'Classify lab reports and extract their results with the CloudRaker paperwork API.',
      },
      { name: 'color-scheme', content: 'light dark' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  component: () => <Outlet />,
  shellComponent: ({ children }) => (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  ),
})
