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

1. **Business Discovery Scraper**: Features a modular connector architecture. Each data source (e.g. Google Places) implements a unified connector contract (`BaseConnector`) and normalizes results into the standard database schema.
2. **Lead Dashboard**: A React dashboard facilitating paginated search, bulk actions (tagging, sequence enrollment), contact state transitions, and custom Opportunity Score ranking.
3. **Outreach Queue Worker**: A state-machine-driven queue processor that schedules and delivers multi-step, multi-channel templates (Gmail SMTP/API, Twilio SMS/WhatsApp) based on configurable wait periods.

---

## 📂 Project Directory Structure

```
.
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   └── database.ts        # Database connection pool configuration
│   │   ├── outreach/
│   │   │   └── worker.ts          # Outreach campaign queue sequence worker
│   │   ├── scraper/
│   │   │   ├── connector.ts       # Abstract Base Class for scraper connectors
│   │   │   └── connectors/
│   │   │       └── google_places.ts # Google Places API Connector
│   │   └── index.ts               # REST API endpoints & server entry
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── assets/
│   │   ├── components/
│   │   │   └── Dashboard.tsx      # Dashboard UI (filters, tables, modals)
│   │   ├── App.tsx                # Mounts the Lead Management Dashboard
│   │   ├── index.css              # Entrypoint styling loading Tailwind CSS directives
│   │   └── main.tsx               # DOM Renderer
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   └── package.json
├── schema.sql                     # PostgreSQL schema definition
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
3. Run the schema script [schema.sql](file:///c:/A/PROJECT/job/schema.sql) against the database to initialize all tables, types, indexes, and triggers:
   ```bash
   psql -U postgres -d business_discovery_outreach -f schema.sql
   ```

### 2. Backend Installation & Run
1. Navigate to the `backend/` directory:
   ```bash
   cd backend
   ```
2. Install packages:
   ```bash
   pnpm install
   ```
3. Set environment variables (create a `.env` file):
   ```env
   PORT=3001
   DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/business_discovery_outreach
   ```
4. Start the API server in development mode:
   ```bash
   pnpm run dev
   ```

### 3. Frontend Installation & Run
1. Navigate to the `frontend/` directory:
   ```bash
   cd ../frontend
   ```
2. Install packages:
   ```bash
   pnpm install
   ```
3. Start the Vite dev server:
   ```bash
   pnpm run dev
   ```
4. Access the dashboard at `http://localhost:5173`.

---

## 📝 REST API Endpoint Documentation

| Endpoint | Method | Description | Parameters |
| :--- | :--- | :--- | :--- |
| `/api/v1/leads` | `GET` | Retrieve paginated leads list | `has_website`, `scale`, `contact_status`, `category`, `ref_lat`, `ref_lng`, `radius_meters`, `sort_by` |
| `/api/v1/leads/bulk-action` | `POST` | Perform operations on selected leads | `business_ids`, `action` (`enroll_sequence`, `update_status`), `params` |
| `/api/v1/leads/:id/notes` | `POST` | Add annotation notes to a specific business | `note`, `author_id` |
| `/api/v1/scrape` | `POST` | Manually trigger search scraping | `query`, `latitude`, `longitude`, `radius_meters` |
| `/api/v1/outreach/process` | `POST` | Manually run queue sequence steps | None |

---

## ⚖️ Legal & Compliance Guide

Before running campaigns, ensure compliance with these frameworks:
1. **CAN-SPAM / CASL**: Always provide a visible unsubscribe link. Every opt-out request must set `opted_out = true` immediately inside the `contacts` table to block subsequent runs.
2. **WhatsApp Business Policies**: Exceeded spam reports cause phone number bans. Initiate contact with Meta-approved templates or request user opt-ins first.
3. **Scraping Limits**: Respect `robots.txt` policies. Implement throttling and queue delays in your scraper worker to avoid IP rate-limiting.
