# EclipseGpt

Bienvenue sur le dépôt source de **EclipseGPT**, propulsé par Cloudflare Workers & Cloudflare Pages.

## Déploiement Cloudflare
Ce projet est optimisé pour être déployé automatiquement sur Cloudflare Pages.
- Le backend repose sur **Hono.js**.
- La base de données utilise **Cloudflare D1**.
- L'authentification utilise un système hybride **Discord OAuth2 + Clés de Licence Premium**.

## Scripts
- `npm run dev` : Lance le serveur de développement local avec Wrangler sur le port 3000.
- `npm run build` : Compile le backend (`src/index.js`) vers `public/_worker.js` pour la production Cloudflare Pages via `esbuild`.
