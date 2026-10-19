# LeadStream Pro — Business Discovery & Outreach System

LeadStream Pro is a complete, multi-module system designed to automatically discover local and global small businesses that lack a digital presence (specifically, websites), manage them inside an interactive scoring dashboard, and automate multi-channel outreach campaigns (via Gmail, WhatsApp, and SMS) to convert them.

---

## 🛠️ Tech Stack

### Backend
- **Core**: Node.js, TypeScript, Express.js
- **Database**: PostgreSQL (native `POINT` type coordinates for lightweight spatial indexing)
- **Database Driver**: `pg` (node-postgres)
- **Development Runtime**: `tsx` (TypeScript Execute)

### Frontend
- **Framework**: React 19, Vite, TypeScript
- **Styling**: Tailwind CSS v3, PostCSS, Autoprefixer
- **Icons**: Lucide React

---

## 🏗️ System Architecture

The system is organized into three decoupled modules:

```
                  +-----------------------------------------+
                  |  Module 1: Scraper & Discovery Engine   |
                  +-----------------------------------------+
                                       |
                                       v
                  +-----------------------------------------+
                  |      Module 2: PostgreSQL Database      |
                  +-----------------------------------------+
                                       |
                                       v
+--------------------------------------+---------------------------------------+
|                                                                              |
v                                                                              v
+--------------------------------------+      +--------------------------------+
|  Module 3: Lead Management Dashboard  |      |   Module 4: Outreach Worker    |
+--------------------------------------+      +--------------------------------+
```

1. **Business Discovery Scraper**: Features a modular connector architecture. Each data source (OpenStreetMap Overpass today, plus a mocked Google Places connector) implements a unified connector contract (`BaseConnector`) and normalizes results into the standard database schema.
2. **Lead Dashboard**: A React dashboard facilitating paginated search, bulk actions (tagging, sequence enrollment), contact state transitions, and custom Opportunity Score ranking.
3. **Outreach Queue Worker**: A state-machine-driven queue processor that schedules and delivers multi-step, multi-channel templates (Gmail SMTP/API, Twilio SMS/WhatsApp) based on configurable wait periods.

---

## 📂 Project Directory Structure

```
.
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   └── database.ts        # PostgreSQL pool (requires DATABASE_URL)
│   │   ├── lib/
│   │   │   ├── scoring.ts         # Opportunity Score heuristic
│   │   │   └── validation.ts      # Request input validation helpers
│   │   ├── outreach/
│   │   │   ├── templates.ts       # {{ placeholder }} template rendering
│   │   │   └── worker.ts          # Outreach campaign queue sequence worker
│   │   ├── scraper/
│   │   │   ├── connector.ts       # Abstract base class for scraper connectors
│   │   │   ├── email.ts           # Homepage contact-email extraction
│   │   │   └── connectors/
│   │   │       ├── osm.ts           # OpenStreetMap Overpass connector (used by /scrape)
│   │   │       └── google_places.ts # Google Places connector (mocked responses)
│   │   └── index.ts               # REST API endpoints & server entry
│   ├── test/                      # node:test unit tests (run with `pnpm test`)
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   └── Dashboard.tsx      # Dashboard UI (filters, tables, modals)
│   │   ├── App.tsx                # Mounts the Lead Management Dashboard
│   │   ├── config.ts              # API base URL (VITE_API_BASE_URL)
│   │   ├── index.css              # Tailwind CSS directives
│   │   └── main.tsx               # DOM renderer
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   └── package.json
├── .env.example                   # Template for backend/.env
├── schema.sql                     # PostgreSQL schema definition
├── seed.sql                       # Default operator, templates & outreach sequence
├── pnpm-workspace.yaml            # pnpm workspace (backend + frontend)
└── README.md                      # Documentation (this file)
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- PostgreSQL (v15+)
- `pnpm` (recommended package manager)

### 1. Database Setup
1. Ensure the PostgreSQL service is running.
2. Log into your database console and create a database named `business_discovery_outreach`:
   ```sql
   CREATE DATABASE business_discovery_outreach;
   ```
3. Run the schema script [schema.sql](schema.sql) against the database to initialize all tables, types, indexes, and triggers:
   ```bash
   psql -U postgres -d business_discovery_outreach -f schema.sql
   ```
4. Load the seed data (default operator user, outreach templates and the
   "Standard Cold Outreach Sequence" that the dashboard's **Enroll** button uses):
   ```bash
   psql -U postgres -d business_discovery_outreach -f seed.sql
   ```

### 2. Environment Configuration
Copy the example environment file into the backend package and fill in your values:
```bash
cp .env.example backend/.env
```
- `DATABASE_URL` is **required**; the API refuses to start without it. URL-encode
  special characters in the password (`@` → `%40`).
- SMTP and Twilio settings are optional. When they are blank, email goes to an
  auto-created [Ethereal](https://ethereal.email) test inbox (preview links are
  printed to the console) and SMS/WhatsApp sends are simulated in the logs.
- `SCRAPER_CONTACT_EMAIL` is sent in the Overpass User-Agent; `OVERPASS_API_URL`
  optionally points the scraper at another Overpass mirror.
- The frontend talks to `http://localhost:3001` by default. Set
  `VITE_API_BASE_URL` (e.g. in `frontend/.env.local`) to use another backend.

### 3. Workspace Installation & Run
1. From the project root directory, install all package dependencies across all workspace projects:
   ```bash
   pnpm install
   ```
2. Start both the backend API server and the frontend Vite development server in parallel with a single command:
   ```bash
   pnpm dev
   ```
3. Access the dashboard at `http://localhost:5173` (API on `http://localhost:3001`).

### 4. Checks
Run these from the repo root:

| Command | What it does |
| :--- | :--- |
| `pnpm test` | Backend unit tests (validation, scoring, templates, email extraction, OSM normalisation) |
| `pnpm typecheck` | Strict TypeScript check of backend source and tests |
| `pnpm lint` | Oxlint on the frontend |
| `pnpm build` | Compile the backend (`backend/dist`) and build the frontend (`frontend/dist`) |
| `pnpm check` | All of the above |

---

## 📝 REST API Endpoint Documentation

| Endpoint | Method | Description | Parameters |
| :--- | :--- | :--- | :--- |
| `/api/v1/leads` | `GET` | Retrieve paginated leads list | `has_website`, `scale`, `contact_status`, `category`, `ref_lat`, `ref_lng`, `radius_meters`, `sort_by` (`opportunity_score`, `review_count`, `distance`, anything else = newest), `order` (`asc`/`desc`), `limit` (1–100, default 20), `page` |
| `/api/v1/leads/bulk-action` | `POST` | Perform operations on selected leads | `business_ids` (UUIDs), `action` (`approve`, `reject`, `update_status`, `enroll_sequence`), `params` (`contact_status` or `sequence_id`/`enrolled_by`) |
| `/api/v1/leads/:id/notes` | `POST` | Add annotation notes to a specific business | `note`, `author_id` (optional UUID) |
| `/api/v1/scrape` | `POST` | Scrape OpenStreetMap for an amenity/shop/craft tag (e.g. `bakery`) | `query`, `latitude`, `longitude`, `radius_meters` (1–50000, default 5000) |
| `/api/v1/outreach/sequences` | `GET` | List sequences with their ordered steps and templates | None |
| `/api/v1/outreach/templates` | `GET` | List outreach templates | None |
| `/api/v1/outreach/enrollments` | `GET` | List enrollments with last message status | None |
| `/api/v1/outreach/enrollments/:id/toggle-pause` | `POST` | Pause or resume an enrollment | None |
| `/api/v1/outreach/process` | `POST` | Manually run queue sequence steps | None |

Invalid input (unknown enum values, malformed UUIDs, out-of-range coordinates)
returns `400` with an `{ "error": "..." }` body.

Outreach templates support `{{ business_name }}`, `{{ category }}` and `{{ city }}` placeholders.

> **Note:** only approved leads can be enrolled in a sequence. Approve them in the
> dashboard first (or via `action: "approve"`); the database trigger in
> `schema.sql` rejects enrollments for unapproved businesses.

---

## ⚖️ Legal & Compliance Guide

Before running campaigns, ensure compliance with these frameworks:
1. **CAN-SPAM / CASL**: Always provide a visible unsubscribe link. Every opt-out request must set `opted_out = true` immediately inside the `contacts` table to block subsequent runs.
2. **WhatsApp Business Policies**: Exceeded spam reports cause phone number bans. Initiate contact with Meta-approved templates or request user opt-ins first.
3. **Scraping Limits**: Respect `robots.txt` policies. Implement throttling and queue delays in your scraper worker to avoid IP rate-limiting.
