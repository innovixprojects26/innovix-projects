// Runs before React/styles paint. Keep preference resolution in this one shared store.
;(function () {
  const key = 'innovix_theme'
  const choices = ['light', 'dark', 'system']
  const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null
  const read = () => {
    try { const value = localStorage.getItem(key); return choices.includes(value) ? value : 'system' } catch { return 'system' }
  }
  let preference = read()
  const apply = () => {
    const resolved = preference === 'system' ? media?.matches ? 'dark' : 'light' : preference
    document.documentElement.dataset.theme = resolved
    document.documentElement.dataset.themePreference = preference
    document.documentElement.style.colorScheme = resolved
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#080e20' : '#f5f7ff')
    window.dispatchEvent(new Event('innovix-theme-change'))
  }
  window.innovixTheme = {
    getSnapshot: () => `${preference}:${document.documentElement.dataset.theme}`,
    setPreference(value) {
      if (!choices.includes(value)) return
      preference = value
      try { localStorage.setItem(key, value) } catch { /* Theme still works when storage is blocked. */ }
      apply()
    },
  }
  media?.addEventListener('change', () => { if (preference === 'system') apply() })
  window.addEventListener('storage', (event) => { if (event.key === key || event.key === null) { preference = read(); apply() } })
  apply()
})()
