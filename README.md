# Innovix Projects

Existing React, Express, and MongoDB application. The public catalog at `/projects` reads published records from `GET /api/projects`; the admin area manages those same records.

## Local development

1. Copy `.env.example` to `.env` and configure MongoDB and admin credentials.
2. Install dependencies with `npm install`.
3. Start the frontend and API together with `npm run dev:full`.
4. Open `http://localhost:5173/projects`.

Vite forwards `/api` requests to the Express server on port 5000. For a separate frontend deployment, set `VITE_API_URL` to the full API base URL (including `/api`) at build time and set `CLIENT_URL` on the API to the frontend origin. For a same-origin deployment, route `/api/*` to Express and other paths to the frontend.

The public catalog only includes projects with `published: true`. Use the admin Projects page to publish records. The API must connect to MongoDB before it begins listening.

## Production deployment preparation

Deploy the Vite build as a static site and the Express API as a separate Node web service. The development Vite proxy and Cloudflare Quick Tunnel are not part of production.

- Frontend: use Node matching `package.json` engines, run `npm ci && npm run build`, publish `dist`, and configure an SPA rewrite from `/*` to `/index.html`. The actual internship route is `/internships`.
- Frontend build variable: set `VITE_API_URL` to the HTTPS backend origin followed by `/api` (for example, `https://your-backend-host.example/api`). This value is public and is embedded at build time. Rebuild the frontend when it changes.
- Backend: run `npm ci --omit=dev` and `npm start`. Set `NODE_ENV=production`; the service reads the hosting provider's `PORT` and listens on all interfaces.
- Backend secrets/configuration: set `MONGODB_URI`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_INITIAL_PASSWORD`, and `CLIENT_URL` in the hosting provider's private environment settings. `CLIENT_URL` must be the exact HTTPS frontend origin, without a trailing slash. Keep the existing Atlas URI and admin credentials private; do not run seed or reset scripts.
- If the backend is behind a trusted reverse proxy, set `TRUST_PROXY_HOPS` to the verified number of proxy hops so the rate limiter uses the client IP. Leave it unset for direct local development. Configure this only after confirming the hosting provider's proxy topology.
- In Atlas, permit the backend service's outbound IPs or ranges; do not add the frontend static host because browsers never connect directly to Atlas. Keep the access list as narrow as the chosen host permits.

After deployment, verify `GET /api/health`, `GET /api/projects` (12 published projects), a direct refresh of `/projects` and `/admin/login`, admin login, and each form against the intended Atlas database. Use the hosting provider's managed HTTPS certificate. The public support email is display-only and does not configure backend mail delivery.
