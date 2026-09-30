# Innovix presentation and themes

`src/premium.css` is the final presentation layer, loaded after the existing component styles. Its light and dark CSS variables define page/surface colors, text, borders, semantic states, accent colors, shadows and glow. Existing layouts and component behavior remain in their original files. Responsive overrides cover laptop, tablet and mobile widths; reduced-motion preferences disable decorative movement.

The navbar, admin login and admin header use `src/ThemeSelector.jsx`. Light and Dark explicitly select a palette. System is the default and follows `prefers-color-scheme`, including changes while the page is open. The preference is saved under `innovix_theme` in localStorage. Cross-tab storage changes are reflected immediately. If storage is unavailable, selection still works for the current page.

`public/theme-init.js` runs synchronously in the document head before React to resolve the initial palette. It sets `data-theme`, `data-theme-preference`, native control `color-scheme` and the browser theme-color. React subscribes to that same store rather than maintaining a second preference implementation.

The redesign uses CSS graphics and the existing icon library. No dependencies were added. Backend APIs, authentication, data models and live-class URLs were not changed by the redesign.

## Validation

- `node --test tests/student-ui.test.mjs tests/theme.test.mjs`: student forms/navigation/guards, all theme modes, OS changes, persistence across a simulated refresh, cross-tab changes, blocked storage and accessible theme control rendering.
- `node --test server/student-auth.test.js server/content-videos.test.js server/tech-news.test.js`: authentication/session/reset/access controls, video uploads/playback/management, news publishing and CRUD.
- `npm.cmd run lint` and `npm.cmd run build`.

No browser was connected in the implementation environment. Rendered desktop/mobile layouts, actual device theme changes, modal appearance, keyboard interaction and end-to-end page navigation still require browser visual QA. Automated theme tests simulate browser APIs; server-rendered UI tests do not measure layout. Existing live-class URLs were preserved, but Zoom meetings were not joined. The build retains its large JavaScript chunk warning.
