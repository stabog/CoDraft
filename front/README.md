# CoDraft Front

Prototype of a Markdown document workspace with local persistence.

## Stack

- Vue 3
- Vue Router
- Pinia with persisted user state
- Local API adapter over `localStorage`
- Markdown preview with `markdown-it`

## Scripts

```bash
npm install
npm run dev
```

The frontend talks to `src/api/documentsApi.js`. For now it exports the local adapter. Later it can be switched to an HTTP adapter that calls the PHP backend with the same method names.
