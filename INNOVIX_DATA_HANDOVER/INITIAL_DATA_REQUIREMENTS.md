# Initial Data Requirements

This document describes the initial and bootstrap data the application expects to exist before standard public and admin workflows operate properly.

## Bootstrap data

1. `WebsiteConfig` singleton
   - Required for homepage settings, feature flags and default services.
   - Created lazily by `getConfig()` when absent.

2. `DiscoverCategory` catalog
   - Used for the Learn & Discover taxonomy.
   - Seeded via `ensureDiscoverCategories()` only when the category catalog is empty.

3. Default internship domains
   - Generated via `ensureDomains()` from `internshipRoles` and `liveClasses` values.
   - Ensures domain definitions exist for management and public display.

4. Admin account
   - Created through admin bootstrap scripts when no admin record configured.
   - Credentials are managed through server-side auth; no secrets are included in this handover package.

5. Seed project catalog and default public project content
   - Used by the seed flow and default project setup in the current workspace.

## Required seeded values

- Project list definitions
- Homepage and feature settings
- Discover category defaults
- Default internship domains
- Admin bootstrap credentials or admin account initialization
- Live class metadata and role metadata

## Scripts and seed flow relevant to initialization

- `server/seed.js`
- `server/create-admin.js`
- `server/reset-admin.js`
- `server/refresh-discover.js`
- `server/models/management.js` (`getConfig`, `ensureDomains`)
- `server/models/discover.js` (`ensureDiscoverCategories`)

## Safe deployment note

These requirements describe what data must exist for the app to function normally; they do not authorize any modification of production MongoDB data or any security-sensitive environment file.
