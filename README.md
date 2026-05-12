# OptiTrack WMS

**Warehouse management system with AI-powered decision support.**

OptiTrack combines a fully async FastAPI backend, a Next.js 14 frontend, PostgreSQL, Redis-backed background jobs, S3-compatible object storage, and a Groq-powered AI assistant for live warehouse analytics.

## Features

- **Inventory management:** Track products, quantities, stock status, categories, and warehouse locations.
- **Transaction processing:** Record inbound, outbound, and adjustment transactions with automatic inventory updates.
- **Financial visibility:** Store cost price, sell price, unit price, totals, gross profit, and margin metrics.
- **AI assistant:** Ask natural-language questions about stock, low inventory, sales, warehouse value, categories, and locations.
- **Multi-tenant data isolation:** Scope user-owned warehouse data to the authenticated account.
- **Role-based access control:** Protect administrative operations with JWT authentication and role checks.
- **Profile image storage:** Upload profile images to S3-compatible storage such as MinIO or AWS S3.
- **Operational health checks:** Expose liveness and readiness endpoints for deployment platforms.

## Tech Stack

### Backend

| Technology | Purpose |
|------------|---------|
| Python 3.11+ | Backend runtime |
| FastAPI | Async API framework |
| SQLAlchemy 2.0 async | ORM and database access |
| PostgreSQL | Primary relational database |
| Redis + arq | Background job queue for AI chat |
| Groq SDK | Llama-powered AI tool-calling assistant |
| Pydantic v2 | Request, response, and settings validation |
| JWT + bcrypt | Authentication and password hashing |
| aioboto3 | Async S3-compatible object storage |
| SlowAPI | API rate limiting |
| pytest + httpx | Backend testing |

### Frontend

| Technology | Purpose |
|------------|---------|
| Next.js 14 | React framework with App Router |
| TypeScript | Type-safe frontend development |
| Tailwind CSS | Utility-first styling |
| Radix UI | Accessible UI primitives |
| Zustand | Lightweight client-side state |
| Axios | Shared API client |
| React Hook Form + Zod | Form state and validation |
| Recharts | Dashboard charts |
| Lucide React | Icons |

### Local Infrastructure

| Service | Purpose |
|---------|---------|
| API | FastAPI application served by Gunicorn/Uvicorn |
| Worker | arq worker for AI chat jobs |
| DB Init | One-shot schema bootstrap job |
| PostgreSQL | Warehouse data |
| Redis | Queue and job result storage |
| MinIO | Local S3-compatible object storage |
| MinIO Init | One-shot bucket creation and public read setup |

## Repository Structure

```text
Optitrack/
├── backend/
│   ├── app/
│   │   ├── core/             # Config, database, security, schemas, health checks
│   │   ├── models/           # SQLAlchemy ORM models
│   │   ├── routes/           # FastAPI route modules
│   │   ├── services/         # AI, queue, storage, and demo data services
│   │   └── workers/          # arq worker configuration
│   ├── scripts/              # Database bootstrap scripts
│   ├── tests/                # Backend test suite
│   ├── Dockerfile
│   ├── docker-compose.yml
│   ├── main.py
│   └── requirements.txt
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── app/              # Next.js App Router pages
│   │   ├── components/       # Reusable UI and feature components
│   │   ├── hooks/            # Data fetching and UI hooks
│   │   ├── lib/              # API client and shared utilities
│   │   ├── store/            # Zustand stores
│   │   └── types/            # Shared TypeScript types
│   ├── next.config.js
│   └── package.json
├── database.md               # Database schema reference
└── README.md
```

## Prerequisites

- **Python:** 3.11+
- **Node.js:** 18+
- **Docker Desktop:** Recommended for the backend infrastructure stack
- **Groq API key:** Required for AI responses

## Quick Start

### 1. Start the Backend Stack

From the backend directory: (cd backend)

```bash
docker compose up --build
```

The compose stack starts:

- **API:** `http://localhost:8000`
- **PostgreSQL:** host port `5433`
- **Redis:** host port `6379`
- **MinIO API:** `http://localhost:9000`
- **MinIO Console:** `http://localhost:9001`
- **Worker:** arq worker for AI chat jobs
- **Setup jobs:** `db-init` and `minio-init`

If you want AI responses locally, set `GROQ_API_KEY` before starting Compose:
You can Groq free API keys at https://console.groq.com/keys 

```bash
set GROQ_API_KEY=your-groq-api-key
docker compose up --build
```

PowerShell users can set it with:

```powershell
$env:GROQ_API_KEY = "your-groq-api-key"
docker compose up --build
```

### 2. Start the Frontend

From the frontend directory: (cd frontend)

```bash
npm install
npm run dev
```

The frontend runs on:

```text
http://localhost:3000
```

The frontend proxies `/api/*` requests to `NEXT_PUBLIC_API_URL`, which defaults to `http://localhost:8000`.

## Manual Backend Setup

Use this path when you do not want Docker for the API process.

### 1. Install Dependencies

```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configure Environment

Create `backend/.env`:

```env
ENVIRONMENT=development
SECRET_KEY=replace-with-a-random-secret-at-least-32-characters
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/optitrack_wms
REDIS_URL=redis://localhost:6379/0
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
GROQ_API_KEY=
GROQ_MODEL=llama-3.3-70b-versatile
STORAGE_BACKEND=s3
S3_ENDPOINT_URL=http://localhost:9000
S3_PUBLIC_URL_BASE=http://localhost:9000/optitrack
S3_REGION=us-east-1
S3_BUCKET=optitrack
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
S3_USE_PATH_STYLE=true
INIT_DB_ON_STARTUP=false
```

### 3. Initialize the Database

Run the schema bootstrap once before starting API workers:

```bash
python -m scripts.init_db
```

### 4. Run the API

```bash
python main.py
```

### 5. Run the Worker

In a second backend terminal:

```bash
arq app.workers.arq_worker.WorkerSettings
```

## Frontend Setup

Create `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_APP_NAME=OptiTrack WMS
```

Run development mode:

```bash
cd frontend
npm install
npm run dev
```

Build for production:

```bash
npm run build
npm start
```

## Service URLs

| Service | URL |
|---------|-----|
| Frontend | `http://localhost:3000` |
| Backend API | `http://localhost:8000` |
| Swagger UI | `http://localhost:8000/docs` |
| OpenAPI JSON | `http://localhost:8000/openapi.json` |
| Liveness | `http://localhost:8000/livez` |
| Readiness | `http://localhost:8000/readyz` |
| MinIO Console | `http://localhost:9001` |

## API Overview

### Authentication

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `PUT /api/auth/me`
- `POST /api/auth/upload-image`
- `POST /api/auth/forgot-password`
- `POST /api/auth/change-password`
- `POST /api/auth/logout`

### Products

- `POST /api/products/`
- `GET /api/products/`
- `GET /api/products/{product_id}`
- `GET /api/products/sku/{sku}`
- `PUT /api/products/{product_id}`
- `DELETE /api/products/{product_id}`

### Inventory

- `POST /api/inventory/`
- `GET /api/inventory/`
- `GET /api/inventory/locations`
- `GET /api/inventory/{inventory_id}`

### Transactions

- `POST /api/transactions/`
- `GET /api/transactions/`
- `GET /api/transactions/{transaction_id}`

### Categories

- `GET /api/categories/`
- `POST /api/categories/`
- `PUT /api/categories/{category_id}`
- `DELETE /api/categories/{category_id}`

### Locations

- `GET /api/locations/`
- `POST /api/locations/`
- `PUT /api/locations/{location_id}`
- `DELETE /api/locations/{location_id}`

### Dashboard

- `GET /api/dashboard/stats`
- `GET /api/dashboard/sales-chart`
- `GET /api/dashboard/metrics`

### AI Chat

- `POST /api/ai/chat`

## Business Rules

### Transaction Types

| Type | Inventory Effect | Price Source |
|------|------------------|--------------|
| `INBOUND` | Adds quantity | Product cost price |
| `OUTBOUND` | Subtracts quantity and validates available stock | Product sell price |
| `ADJUST` | Sets quantity to the submitted value | Product cost price |

### Inventory Status

| Status | Meaning |
|--------|---------|
| `OUT_OF_STOCK` | Quantity is zero |
| `LOW_STOCK` | Quantity is below the product minimum stock level |
| `IN_STOCK` | Quantity meets or exceeds the product minimum stock level |

### Multi-Tenancy

User-owned data is scoped by authenticated user ownership. Products, categories, locations, inventory, transactions, and dashboard views must remain isolated between accounts.

## AI Assistant

The AI assistant uses a Groq tool-calling flow to query live warehouse data. It can answer questions about:

- **Inventory summaries:** Quantities, values, locations, and categories
- **Low-stock items:** Reorder candidates and urgency
- **Recent transactions:** Purchases, sales, and adjustments
- **Warehouse value:** Total cost, retail value, and potential profit
- **Product search:** Name, SKU, and category matching
- **Sales analytics:** Top products, revenue, and gross profit
- **Category breakdowns:** Stock and value by category
- **Location stock levels:** Inventory distribution by warehouse location

AI chat requests are handled by the API process. If `GROQ_API_KEY` is not configured, the backend can still start and the AI endpoint returns a configuration message.

## Database Management

Initialize or update the schema:

```bash
cd backend
python -m scripts.init_db
```

Seed sample data for local development:

```bash
cd backend
python tests/scripts/seed_data.py
```

Reset the local database with the test utility:

```bash
cd backend
python tests/scripts/reset.py
```

For schema details, see `database.md`.

## Testing

Run backend tests:

```bash
cd backend
pytest
```

Run frontend linting:

```bash
cd frontend
npm run lint
```

Build the frontend:

```bash
cd frontend
npm run build
```

## Environment Variables

### Backend

| Variable | Required | Purpose |
|----------|----------|---------|
| `ENVIRONMENT` | Yes | `development`, `staging`, or `production` |
| `SECRET_KEY` | Yes | JWT signing secret |
| `DATABASE_URL` | Yes | SQLAlchemy async database URL |
| `REDIS_URL` | Yes | Redis DSN for arq jobs |
| `ALLOWED_ORIGINS` | Yes | Comma-separated CORS origins |
| `GROQ_API_KEY` | No | Enables AI assistant responses |
| `GROQ_MODEL` | No | Groq model name |
| `STORAGE_BACKEND` | No | `local` or `s3` setting |
| `S3_ENDPOINT_URL` | For S3/MinIO | S3-compatible endpoint |
| `S3_PUBLIC_URL_BASE` | For public files | Public object URL base |
| `S3_REGION` | For S3/MinIO | S3 region |
| `S3_BUCKET` | For S3/MinIO | Object bucket |
| `S3_ACCESS_KEY_ID` | For S3/MinIO | S3 access key |
| `S3_SECRET_ACCESS_KEY` | For S3/MinIO | S3 secret key |
| `S3_USE_PATH_STYLE` | For MinIO | Path-style addressing toggle |
| `INIT_DB_ON_STARTUP` | No | Development-only schema bootstrap toggle |
| `SMTP_HOST` | No | SMTP server for password reset emails |
| `SMTP_PORT` | No | SMTP port |
| `SMTP_USER` | No | SMTP username |
| `SMTP_PASSWORD` | No | SMTP password |
| `FRONTEND_URL` | No | Password reset link base URL |

### Frontend

| Variable | Required | Purpose |
|----------|----------|---------|
| `NEXT_PUBLIC_API_URL` | Yes | Backend API base URL |
| `NEXT_PUBLIC_APP_NAME` | No | Display application name |

