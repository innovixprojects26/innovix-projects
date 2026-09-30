# Learn & Discover — implementation and operation

Learn & Discover is an additional, short-form learning feed. Existing Daily Tech News remains separate and unchanged. No articles are copied from Daily Tech News. The current feature is for authenticated students; guests do not receive the floating control or access the feed APIs.

## Student experience

The existing public/student layout shows a **Learn & Discover** floating button when a student is signed in and the feature is enabled. It opens a native modal dialog styled as a right-side drawer, with a full-width sheet below 600px. Opening a card stays inside the drawer. Only **Read Original Source** opens an external page. There are no external iframes or HTML embeds.

The drawer includes For You, News, Facts, Learn and Career filters; type badges; recent unread NEW indicators; editorial Featured/Trending badges; read time; source attribution; internal details; skeletons; error/retry, empty and refresh states; and 20-item pagination. Native dialog handling supplies modal keyboard behavior and Escape dismissal; closing restores focus and scrolling. Existing theme variables support Light/Dark/System, and reduced-motion preferences disable drawer/skeleton animation.

Published items must have a publication date at or before now, an active category, and either the student's exact existing `internshipDomain` or the `General` domain. Exact-domain items rank first, then Featured, publication date and a stable ID tie-breaker. General content supplements domain recommendations; other domains' targeted items are excluded. No domain supplied by the browser can override the authenticated student's domain.

Default category mappings cover all eight current internship domains: Full Stack Development, Data Analytics, Content Creation, Cyber Security, UI/UX Designer, Frontend Developer, Python Developer, and AI & Machine Learning. Admin can edit category keywords/domain mappings and override any individual item's category and domains.

Read state is persisted by the unique `(student, item)` pair in MongoDB. Opening a detail marks it read through the existing authenticated, Origin-checked, CSRF-protected student API. A student's read operation cannot select another student. NEW is reserved for unread visible content published within the last seven days. Read indicators remain across sessions; deleting an item removes its associated read entries.

## Admin setup and workflow

Use the existing `/admin` login, then **Learn & Discover** in the central dashboard. There is no separate admin application or authentication system.

1. In **Categories / Domain Mapping**, review the initial category names, keywords and domain mappings. In-use category names cannot be renamed/deleted until references are moved; they can be disabled. Disabling a category hides its content from students and excludes it from import classification.
2. In **Content**, create manual items of type NEWS, FACT, DID_YOU_KNOW, QUICK_LEARN, NEW_TECH, CAREER or TIP. Add title, short summary, explanation, why it matters, what students can learn, takeaway, category, domains, attribution, read time and publication date. Save Draft, preview, edit, publish/unpublish, feature, mark trending or delete with confirmation. Publication requires the learning prompts. Externally attributed manual content requires an HTTPS source URL.
3. In **Trusted Sources**, add a source name, HTTPS feed URL, RSS/Atom/JSON Feed type, allowed categories and allowed domains. Enable only publishers you trust and feeds you have permission to use. No websites are automatically trusted or preconfigured.
4. In **Website Settings**, enable External Content Import when ready. Keep **Manual Approval** unless you deliberately want eligible new imports from enabled trusted sources published automatically.
5. Click **Refresh Sources Now**. Under Manual Approval, new imports appear as **pending**. Read the publisher's original, edit the short text and learning prompts, correct mappings if needed, then **Approve & Publish** or **Reject**. Facts and Did You Know items can be authored or changed by the administrator; no fabricated facts or source attributions are seeded.

Website Settings adds:

| Setting | Default | Effect |
| --- | --- | --- |
| Learn & Discover | ON | OFF hides the student control and blocks student discovery APIs without deleting content |
| External Content Import | OFF | OFF prevents refresh jobs from fetching/importing sources |
| External Content Publishing | Manual Approval | New imports remain pending; optional Auto Publish Trusted Sources publishes eligible new imports |

Changing publishing mode never republishes rejected/draft existing items. Source disable/delete stops future fetching but retains previously imported content for explicit editorial review. Admin can unpublish/delete those items separately. The existing public configuration refresh carries feature switches to already-open pages; API enforcement takes effect on the next request.

## Import architecture and duplicate prevention

The backend fetches only sources saved and activated through the protected Admin API. Students read stored MongoDB items and never initiate an external fetch. The browser contains no source API keys.

RSS 2.0, Atom and JSON Feed v1/v1.1 are supported. JSON Feed is the provided structured API adapter; arbitrary vendor-specific/key-authenticated APIs need a server-side adapter. Full RSS `content:encoded`, Atom `content`, JSON `content_html` and full article pages are not imported. Only title, URL, date and a short summary/description excerpt are used. Excerpts are limited to 40 words and 400 characters; missing summaries use a neutral title-based fallback. Titles are capped at 180 characters. Imported cards identify the publisher, and detail views distinguish feed excerpts from generic Innovix learning prompts. Admin can replace those prompts with a reviewed explanation. There is no AI summarization service or claimed automated fact verification.

Category keyword matching is bounded to configured, active categories within each source's allowed mappings. Matching uses word boundaries; General is the fallback when allowed, otherwise the configured allowed category is used. The resulting domains are intersected with the source's allowed domains. Items with no valid mapping are skipped. New imports use NEWS; Admin may change their type after review.

The normalized original URL (lowercase hostname through URL parsing, fragment removed, common tracking parameters removed, sorted query parameters) is SHA-256 hashed into a unique `externalKey`. MongoDB upserts with `$setOnInsert` prevent duplicates, including concurrent imports and repeats across sources. Existing editorial text/status/mappings are never overwritten by refresh. Imported-item deletion removes its content and read records but retains a hash tombstone, so refreshing cannot resurrect it. Manual-item deletion is a regular record deletion.

Each source has a database lease, a 15-minute cooldown and source health fields: `lastFetchedAt`, `fetchStatus`, `fetchError`, `nextFetchAt`. Refresh handles up to 10 due sources per invocation and up to 30 feed entries per source. Leases coordinate API and CLI workers; edits invalidate a worker's lease. Global import and source-active state are rechecked before each insertion. Raw upstream errors, credentials and feed bodies are not stored in the audit log.

## Fetch security

- Only HTTPS public hostnames on port 443 are accepted. Credentials in URLs, IP literals, local/internal host suffixes, fragments, unsafe schemes and malformed URLs are rejected.
- DNS lookup is limited to IPv4 A records, has a two-second timeout, and rejects any returned private, loopback, link-local, shared-address, reserved, multicast or documentation range. IPv6-only sources are not supported in this version.
- The validated public IPv4 address is pinned into the HTTPS request's lookup callback. TLS hostname/certificate verification remains enabled. Connections are not pooled or routed through a proxy.
- Redirects are rejected, including redirects to private destinations. Configure the final HTTPS feed URL directly.
- The request has an eight-second deadline, a 1 MiB response limit, accepted feed/XML/JSON MIME types and identity encoding only. Compressed responses and HTML pages are rejected.
- XML DTD/entities are rejected; entity expansion is disabled, nesting and element counts are bounded, and only the structured feed fields are parsed.
- Imported markup is converted to bounded plain text. React renders text normally; no `dangerouslySetInnerHTML`, script execution or embedded external website is used.
- Admin APIs reuse the existing bearer-token protection and audit middleware. Student APIs reuse existing sessions, account-status checks, no-store responses, HttpOnly cookies and CSRF handling.

The implementation uses [Node's HTTPS request API](https://nodejs.org/api/https.html) and the server-side [fast-xml-parser library](https://github.com/NaturalIntelligence/fast-xml-parser). Added direct dependency: `fast-xml-parser` 5.11.1, locked with its transitive packages. It is not imported into the browser bundle.

## MongoDB additions

| Model / collection | Purpose |
| --- | --- |
| DiscoverItem / discoveritems | Manual/imported discoveries, editorial status, mappings, attribution and unique URL hash |
| DiscoverSource / discoversources | Trusted feed configuration, allowed mappings, health, lease and cooldown |
| DiscoverCategory / discovercategories | Categories, domain mappings and matching keywords |
| DiscoverRead / discoverreads | Private per-student read state with a compound unique index |

Existing WebsiteConfig is extended with the three settings above and a category-initialization marker. Startup initializes default mappings once without overwriting edits. No existing student/project/news/video data or authentication models are replaced. New student-domain values added to the platform in future must also be added to its existing shared domain definition; all currently supported domains are already covered.

## New APIs

| Method | Route | Access |
| --- | --- | --- |
| GET | `/api/student/discover?tab=For%20You&page=1` | Student session; paginated personalized items and recent unread count |
| GET | `/api/student/discover/:id` | Student session; visible relevant item only |
| POST | `/api/student/discover/:id/read` | Student session + Origin + CSRF |
| GET, POST | `/api/admin/discover/items` | Existing Admin authentication; list supports `status`, `type`, `search`, `page` |
| PATCH, DELETE | `/api/admin/discover/items/:id` | Existing Admin authentication |
| GET, POST | `/api/admin/discover/sources` | Existing Admin authentication |
| PATCH, DELETE | `/api/admin/discover/sources/:id` | Existing Admin authentication |
| GET, POST | `/api/admin/discover/categories` | Existing Admin authentication |
| PATCH, DELETE | `/api/admin/discover/categories/:id` | Existing Admin authentication |
| POST | `/api/admin/discover/refresh` | Existing Admin authentication; additional 2 requests/minute limit |

The existing configuration GET/PUT APIs carry the added website settings. Backend routes are mounted in `server/server.js` before the generic student/admin routes.

## Scheduling — not configured

**No cron job or Windows scheduled task was installed.** Admin's Refresh Sources Now is available. The secure server-local command is:

```powershell
Set-Location -LiteralPath 'D:\innoix pro\innvoix new web'
node server/refresh-discover.js
# Equivalent: npm.cmd run refresh:discover
```

It uses the same ingestion service as Admin, honors the import OFF switch, handles a bounded batch, exits, and returns a non-zero exit code on failures. It requires no public unauthenticated scheduling endpoint and no admin password argument.

For this Windows workspace, create a Task Scheduler task with these exact action fields when scheduling is desired:

```text
Program/script: C:\Program Files\nodejs\node.exe
Arguments: server/refresh-discover.js
Start in: D:\innoix pro\innvoix new web
Trigger: daily, repeat every 15 minutes indefinitely
If the task is already running: Do not start a new instance
```

Run it as the server service account with access to the project configuration and outbound HTTPS/DNS. No elevated administrator account is required by the feature.

For a Linux server installed at `/srv/innovix`, with Node at `/usr/bin/node`, create `/srv/innovix/logs` writable by the application account and use this crontab entry (adjust the two installation paths if different):

```cron
*/15 * * * * cd /srv/innovix && /usr/bin/node server/refresh-discover.js >> /srv/innovix/logs/discover-refresh.log 2>&1
```

No new environment variable is required. The CLI reads the existing `MONGODB_URI` through the existing dotenv configuration; run it from the project directory or provide the variable through the scheduler's environment. Existing web authentication still uses its existing `JWT_SECRET`, `CLIENT_URL` and cookie settings. Source URLs should be public feeds without embedded API credentials. No real `.env` values were read into the report, changed or printed.

## Verification and limitations

Commands used:

```text
node --test server/discover.test.js server/discover-security.test.js server/student-auth.test.js server/tech-news.test.js server/content-videos.test.js server/management.test.js
node --test tests/discover-ui.test.mjs tests/management-ui.test.mjs tests/student-ui.test.mjs tests/theme.test.mjs
npm.cmd run lint
npm.cmd run build
git diff --check
```

The combined backend run passed 10 tests, including Discover domain/read/import workflows, SSRF/parser tests, student/admin authentication, central management, Daily Tech News and videos. The UI/theme run passed 7 tests. Lint passed without warnings; production build passed with the existing large-chunk warning. Vite SSR tests can report the occupied HMR port, but completed successfully. Integration suites use isolated temporary databases, which are removed afterward; test feed payloads are fixtures, not unverified content inserted into the live catalog.

No browser was connected. Actual visual/mobile rendering, native-dialog focus/click behavior and browser end-to-end workflows remain unverified. UI tests cover server-rendered controls/content and responsive/theme CSS contracts, not pixel layout or browser interaction. Existing theme behavior is covered by its regression tests. Production feed availability/usage rights must be checked when Admin chooses sources; none were automatically enabled. No scheduler is configured, no third-party API keys are needed, and no real external news/facts were invented or seeded.

Nothing was committed, pushed or deployed.

## Exact file changes for Learn & Discover

Continued the existing partial files:

```text
server/models/discover.js
server/services/discover-fetch.js
shared/discover.js
```

Created during completion:

```text
LEARN_DISCOVER.md
server/controllers/discover.js
server/discover-security.test.js
server/discover.test.js
server/refresh-discover.js
server/routes/discover.js
server/services/discover-ingest.js
src/DiscoverAdmin.jsx
src/LearnDiscover.jsx
src/discover.css
tests/discover-ui.test.mjs
```

Modified existing files to integrate the feature:

```text
package.json
package-lock.json
server/controllers/management.js
server/models/management.js
server/server.js
src/Admin.jsx
src/ManagementAdmin.jsx
src/components.jsx
src/site-context.js
```

The workspace also contains earlier uncommitted authentication, theme and central-admin work. Those changes were preserved; the lists above identify this feature's files rather than attributing the entire pre-existing Git diff to this task.
