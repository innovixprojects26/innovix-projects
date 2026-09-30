import { useId, useSyncExternalStore } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'

const subscribe = (callback) => {
  window.addEventListener('innovix-theme-change', callback)
  return () => window.removeEventListener('innovix-theme-change', callback)
}
const snapshot = () => window.innovixTheme?.getSnapshot() || 'system:light'
const serverSnapshot = () => 'system:light'

export function ThemeSelector() {
  const id = useId()
  const selection = useSyncExternalStore(subscribe, snapshot, serverSnapshot).split(':')[0]
  const Icon = selection === 'light' ? Sun : selection === 'dark' ? Moon : Monitor
  return <div className="theme-selector"><Icon size={16} aria-hidden="true" /><label className="visually-hidden" htmlFor={id}>Color theme</label><select id={id} aria-label="Color theme" value={selection} onChange={(event) => window.innovixTheme?.setPreference(event.target.value)}><option value="light">Light</option><option value="dark">Dark</option><option value="system">System</option></select></div>
}
