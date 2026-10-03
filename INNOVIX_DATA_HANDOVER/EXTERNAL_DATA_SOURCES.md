# External Data Sources

The Learn & Discover system treats external feeds as trusted public source content and validates them before import.

## Trusted source model

`DiscoverSource` stores:

- `name`
- `url`
- `type`
- `categories`
- `domains`
- `active`
- `lastFetchedAt`
- `fetchStatus`
- `fetchError`
- `nextFetchAt`
- `lockedUntil`

## Supported source types

- RSS
- ATOM
- JSON_FEED

## Validation architecture

The validation and fetch logic in `server/services/discover-fetch.js` is used to enforce:

- public HTTPS-only URLs
- blocklisting by unsafe host pattern or internal/local references
- format validation before ingest
- sanitisation of feed content and metadata
- separate fetch status and error maintenance for each source

## Ingestion architecture

- `DiscoverSource` stores the system configuration of the external source.
- Feed fetch jobs collect the upstream article stream.
- Imported records are normalized to `DiscoverItem`.
- `DiscoverRead` tracks whether a student has interacted with an item.

## Security and trust boundaries

- Source validation prevents internal or localhost URLs from being used.
- The design expects only public, trusted feeds and does not include private or credentialed sources.
- Discovery content is treated as a curated feed rather than a direct untrusted dump into the platform database.
