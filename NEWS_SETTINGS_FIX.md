# News navigation and website settings repair

## Observed root cause

The frontend calls `GET /api/configuration` (`src/api.js` defaults to `/api`; no VITE_API_URL override was configured). Vite proxies `/api` to `http://localhost:5000`.

The Node process on port 5000 started at 00:20 on September 27, 2026, before the configuration route/controller was added. It ran `node server/server.js`, without file watching. Vite picked up the newer frontend, but Node kept the older route table in memory.

Direct requests to port 5000 and requests through Vite on ports 5173 and 5174 returned:

```text
HTTP 404
Content-Type: text/html; charset=utf-8
<pre>Cannot GET /api/configuration</pre>
```

The first diagnostic requests also hit the exhausted shared API limiter:

```text
HTTP 429
Too many requests, please try again later.
```

After its window reset, the underlying 404 was observable. Multiple open Vite instances and 30-second settings polling shared the 120-requests-per-15-minutes budget with all content requests. Each successful configuration poll also replaced the settings object, retriggering dependent content fetches even when nothing changed.

A fresh process using the current source on temporary port 5001 returned 200 against the same MongoDB database before the repair. This ruled out a missing document, a missing source-code route, CORS, MongoDB connectivity, or authorization as the cause of that 404. The public route is registered without admin middleware. The database already contained one `websiteconfigs` document with `_id: "website"`.

## Repair and verification

- Restarted the stale backend on port 5000 with the updated code. Its startup log reports `MongoDB connected` and `Innovix API listening on port 5000`.
- Added `npm run server:dev` using Node's watch mode; `npm run dev:full` now uses it. Production `start` is unchanged.
- Separated public configuration GET/HEAD requests into a 120-per-minute budget. Other API requests keep their original 120-per-15-minutes budget; the stricter authentication limiters remain unchanged. Rate-limit errors now use the JSON response envelope.
- Settings refresh every 60 seconds while the document is visible, plus focus/navigation/admin-change events. Identical responses retain the existing state, avoiding redundant dependent fetches. Real request failures still display the original error and Retry control.
- `getConfig()` atomically creates the singleton with safe defaults when absent, merges defaults for older documents, and leaves saved settings untouched on subsequent reads. Existing settings are never reseeded over admin edits.
- The backend and all three pre-existing Vite addresses now return 200 for `/api/configuration`. A fresh diagnostic Vite server also served `/`, `/news`, the new modules, and the configuration proxy without transform/proxy errors.

The successful response has the existing format:

```js
{ success: true, data: { settings: { /* section switches and public contact settings */ }, homepage: { /* saved/default copy */ }, services: [ /* active services */ ], domains: [ /* 8 active domains in the local database */ ], announcements: [] } }
```

## News and Admin

The new `/news` frontend route aggregates existing features. The header's News link is immediately after the existing theme selector. The selector component, options, behavior, theme initialization script, and theme stylesheet were not edited. On narrow phones, the new link reserves space by hiding only the secondary word in the logo; theme controls retain their existing styles.

Daily Tech News links to the existing `/tech-news` pages and reuses Today's Tech Update. Learn & Discover, Today's Facts, Interesting Facts, Technology Updates, and domain learning open the existing discovery drawer at its corresponding tab. Signed-in students use the existing authenticated feed and its internship-domain ranking. Guests can read Daily Tech News and sign in for discoveries. No new content database, scraper, source subscription, or ingestion system was added.

In **Admin → Website Settings**, save the existing and new switches:

- **News (all news and discoveries)**: master visibility switch for the hub, header/footer link, Daily Tech News, and student discovery UI/API. Individual news/discovery switches retain their values.
- **Internships section**: controls the public internship page, homepage internship sections/navigation, and new applications. Enrolled students keep their existing dashboard, live classes, recordings, and authentication.
- Existing Projects, Daily Tech News, Learn & Discover, applications, forms, testimonials, and import controls remain in the same dashboard.

## Database and routes

Added `settings.newsEnabled` and `settings.internshipsEnabled` to the existing WebsiteConfig schema/defaults, both defaulting to true. The current database's existing record was preserved; these defaults are supplied at read time until the admin saves. Fresh databases persist a complete default singleton automatically. No application records were deleted, reset, or duplicated. Tests create and remove only their uniquely named test databases.

No backend routes were added or renamed. `GET /api/configuration` gains automatic missing-document initialization and an independent limiter; `GET /api/admin/configuration` and `PUT /api/admin/configuration/settings` support the two additional switches. Existing `/api/tech-news`, `/api/tech-news/:id`, and `/api/student/discover` routes honor News OFF. Existing `POST /api/internships/apply` honors Internships OFF. The new `/news` route is frontend-only.

## Exact local commands

Run from the project root in PowerShell (using `npm.cmd` avoids the local npm.ps1 execution-policy restriction):

```powershell
npm.cmd run server:dev
npm.cmd run dev -- --host localhost --port 5175 --strictPort
node --test server/api-limits.test.js server/management.test.js server/student-auth.test.js server/content-videos.test.js server/tech-news.test.js server/discover.test.js server/discover-security.test.js
node --test --test-concurrency=1 tests/student-ui.test.mjs tests/theme.test.mjs tests/management-ui.test.mjs tests/discover-ui.test.mjs tests/news-hub-ui.test.mjs
npm.cmd run lint
npm.cmd run build
Invoke-RestMethod http://localhost:5000/api/configuration
Invoke-RestMethod http://localhost:5173/api/configuration
```

The two dev-server commands run in separate terminals. Port 5175 was used temporarily to capture fresh frontend startup/transform logs without stopping the existing frontend sessions. For routine development with free default ports, use `npm.cmd run dev:full`.

Validation: 11 backend/API tests and 8 UI/theme tests passed, including new concurrent missing-settings initialization, saved-document preservation, budget separation, News visibility, and existing student/admin authentication, CSRF, sessions, reset, recording access, and theme regressions. Lint passed; build passed with the existing bundle-size warning. The UI suite initially passed in parallel with Vite's test-only HMR port-collision warnings; serial test execution avoids those collisions. UI coverage is automated rendering/behavior-contract testing, not a visual browser inspection: no browser was connected to the automation tool.

## Exact files changed for this request

These are this request's files only; earlier work was already uncommitted in the workspace.

```text
package.json
server/server.js
server/middleware/api-limits.js (new)
server/models/management.js
server/controllers/public.js
server/controllers/tech-news.js
server/controllers/discover.js
server/api-limits.test.js (new)
server/management.test.js
server/discover.test.js
src/App.jsx
src/components.jsx
src/site-context.js
src/SiteConfiguration.jsx
src/ManagementAdmin.jsx
src/NewsHub.jsx (new)
src/news-hub.css (new)
src/LearnDiscover.jsx
src/TechNews.jsx
src/StudentDashboard.jsx
src/PublicSections.jsx
src/InternshipForm.jsx
tests/news-hub-ui.test.mjs (new)
NEWS_SETTINGS_FIX.md (new)
```

No `.env` changes, commit, push, or deployment.
