# Baitul Jalal Ilmu Quran — Netlify Ready

This version is adapted for Netlify Functions. The browser files are served from `public/`, while `/api/*` and `/uploads/*` are routed to the serverless function.

## Netlify environment variables

Set these in Netlify Site configuration > Environment variables:

- `NODE_VERSION=22`
- `NODE_ENV=production`
- `ADMIN_EMAIL=afdalarafa75@gmail.com`
- `SESSION_HOURS=12`
- `SESSION_SECRET=<long-random-secret>`

Do not upload `.env` or service-account JSON files to GitHub.

## Deploy from GitHub

1. Push this folder to GitHub.
2. In Netlify choose Add new project → Import an existing project → GitHub.
3. Select the repository.
4. Build command: leave empty (or use `npm run netlify:build`).
5. Publish directory: `public`.
6. Functions directory is already configured as `netlify/functions`.
7. Deploy.

The Netlify rewrite sends `/api/*` to the serverless API. Netlify Functions support Express/server HTTP applications through a serverless adapter.

## Data storage

The application keeps its existing SQLite data model, but on Netlify the database file is synchronized to Netlify Blobs on each function request. Uploaded files are also stored in Netlify Blobs when Google Drive is not enabled.

This is intended for a small temporary deployment. For heavy concurrent production traffic, migrate the relational data layer to a managed SQL database.

## Initial Admin

Email: `afdalarafa75@gmail.com`
Password: `Delisha19@`

Change the password from the application's supported mechanism if/when it is enabled; do not publish credentials in a public README.
