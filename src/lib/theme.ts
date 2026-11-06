// Light and dark theme. Arc reads data-theme on <html>. The choice is a
// per-viewer convenience, so it lives in localStorage (guarded).

import { useCallback, useState } from 'react'

export type Theme = 'light' | 'dark'
const KEY = 'lab-extraction-theme'

/** Runs in <head> before the app renders, so the page never flashes the wrong theme. */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('${KEY}');}catch(e){}if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}var d=document.documentElement;d.dataset.theme=t;d.style.colorScheme=t;})();`

const current = (): Theme =>
  typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(current)
  const setTheme = useCallback((next: Theme) => {
    const root = document.documentElement
    root.dataset.theme = next
    root.style.colorScheme = next
    try {
      localStorage.setItem(KEY, next)
    } catch {
      // storage blocked: the choice lasts for this page only
    }
    setThemeState(next)
  }, [])
  return { theme, setTheme }
}
