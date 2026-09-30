import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { createServer } from 'vite'

const source = await readFile(new URL('../public/theme-init.js', import.meta.url), 'utf8')
function boot({ dark = false, stored = null, blocked = false } = {}) {
  const window = new EventTarget()
  const media = new EventTarget()
  media.matches = dark
  window.matchMedia = () => media
  const root = { dataset: {}, style: {} }
  let color
  const localStorage = {
    getItem() { if (blocked) throw Error('Storage unavailable'); return stored },
    setItem(key, value) { if (blocked) throw Error('Storage unavailable'); assert.equal(key, 'innovix_theme'); stored = value },
  }
  runInNewContext(source, { window, Event, localStorage, document: { documentElement: root, querySelector: () => ({ setAttribute: (key, value) => { color = value } }) } })
  return { window, root, get stored() { return stored }, get color() { return color },
    choose: value => window.innovixTheme.setPreference(value),
    os(value) { media.matches = value; media.dispatchEvent(new Event('change')) },
    storage(value) { stored = value; const event = new Event('storage'); event.key = 'innovix_theme'; window.dispatchEvent(event) },
  }
}

test('theme defaults to System and tracks operating system changes live', () => {
  const app = boot()
  assert.equal(app.window.innovixTheme.getSnapshot(), 'system:light')
  app.os(true)
  assert.equal(app.root.dataset.theme, 'dark')
  assert.equal(app.root.style.colorScheme, 'dark')
  assert.equal(app.color, '#080e20')
  app.os(false)
  assert.equal(app.color, '#f5f7ff')
  assert.equal(boot({ dark: true }).root.dataset.theme, 'dark')
})

test('explicit palettes persist across refresh and ignore OS changes', () => {
  for (const preference of ['light', 'dark', 'system']) {
    const app = boot({ dark: true })
    app.choose(preference)
    assert.equal(app.stored, preference)
    assert.equal(boot({ stored: app.stored, dark: true }).window.innovixTheme.getSnapshot(), `${preference}:${preference === 'system' ? 'dark' : preference}`)
    app.os(false)
    assert.equal(app.root.dataset.theme, preference === 'system' ? 'light' : preference)
  }
})

test('cross-tab changes, invalid preferences and unavailable storage are safe', () => {
  const app = boot({ stored: 'invalid', dark: true })
  assert.equal(app.root.dataset.themePreference, 'system')
  app.storage('light')
  assert.equal(app.root.dataset.theme, 'light')
  app.storage(null)
  assert.equal(app.root.dataset.theme, 'dark')
  app.choose('invalid')
  assert.equal(app.root.dataset.themePreference, 'system')
  const privateMode = boot({ blocked: true })
  privateMode.choose('dark')
  assert.equal(privateMode.root.dataset.theme, 'dark')
})

test('theme initializes before the app and exposes an accessible three-option control', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8')
  assert.ok(html.indexOf('/theme-init.js') < html.indexOf('type="module"'))
  const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
  try {
    const { ThemeSelector } = await vite.ssrLoadModule('/src/ThemeSelector.jsx')
    const markup = renderToString(createElement(ThemeSelector))
    assert.match(markup, /aria-label="Color theme"/)
    for (const value of ['light', 'dark', 'system']) assert.ok(markup.includes(`value="${value}"`))
    assert.match(markup, /value="system" selected=""/)
  } finally { await vite.close() }
})
