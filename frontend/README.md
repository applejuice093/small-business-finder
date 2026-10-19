# LeadStream Pro — Frontend

React 19 + Vite + Tailwind CSS dashboard for the LeadStream Pro lead discovery and
outreach system. See the [root README](../README.md) for the full setup
(database, backend, environment variables).

## Scripts

Run from this folder, or from the repo root with `pnpm --filter frontend <script>`:

| Script | Description |
| :--- | :--- |
| `pnpm dev` | Start the Vite dev server on http://localhost:5173 |
| `pnpm build` | Type-check (`tsc -b`) and build to `dist/` |
| `pnpm lint` | Run Oxlint (React, TypeScript and Oxc rule sets) |
| `pnpm preview` | Serve the production build locally |

## Configuration

The dashboard calls the backend at `http://localhost:3001` by default. To point it
elsewhere, set `VITE_API_BASE_URL`, for example in `frontend/.env.local`:

```bash
VITE_API_BASE_URL=http://192.168.1.20:3001
```

## Structure

- `src/components/Dashboard.tsx` — leads table, filters, scraping modal, notes,
  outreach sequences/templates/enrollments tabs.
- `src/config.ts` — API base URL helper (`apiUrl('/api/v1/...')`).
- `src/App.tsx` / `src/main.tsx` — app shell and React root.
