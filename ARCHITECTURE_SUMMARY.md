# OptiTrack WMS - Architecture Summary

## Project Overview

**OptiTrack WMS** is a multi-tenant Warehouse Management System with a FastAPI async backend, a Next.js 14 frontend, and an optional Groq-powered AI chat assistant for read-only warehouse insights.

Core capabilities:

- **Authentication and profile management:** register, login, JWT auth, profile updates, password change, profile image upload
- **Warehouse master data:** products, categories, and locations
- **Inventory management:** stock quantities by product and location
- **Transaction processing:** inbound, outbound, and adjustment stock movements with financial snapshots
- **Dashboard analytics:** inventory value, low stock, daily transactions, sales/cost/profit chart, and capacity usage
- **AI assistant:** user-initiated chat that can query live warehouse data through read-only tools

---

## Technology Stack

### Backend

| Area | Technology |
|---|---|
| API framework | FastAPI `0.109.0` |
| ASGI server | Uvicorn / Gunicorn with Uvicorn workers |
| Database | PostgreSQL via `asyncpg` |
| ORM | SQLAlchemy 2.0 async |
| Validation | Pydantic v2 and `pydantic-settings` |
| Authentication | JWT with `python-jose`, bcrypt password hashing |
| AI | Groq SDK `0.4.2`, model `llama-3.3-70b-versatile` by default |
| Object storage | Local filesystem or S3-compatible storage through `aioboto3` |
| Rate limiting | SlowAPI |
| Queue/runtime support | Redis and arq services are present in Docker; current AI chat route is direct/synchronous |
| Testing | pytest, pytest-asyncio, httpx, aiosqlite |

### Frontend

| Area | Technology |
|---|---|
| Framework | Next.js 14 App Router |
| Language | TypeScript |
| UI runtime | React 18 |
| Styling | Tailwind CSS |
| Components | Radix UI primitives and local shadcn-style UI components |
| Icons | lucide-react |
| Charts | Recharts |
| State | Zustand plus local React state/hooks |
| Forms | react-hook-form and zod available; several pages also use controlled React state |
| API client | Axios |
| Markdown rendering | react-markdown with remark-gfm |
| i18n | next-intl; current locale configuration is `en` |
| Currency UX | USD, THB, and EUR support with exchange-rate fallback |

---

## Repository Layout

```text
Optitrack/
├── backend/
│   ├── app/
│   │   ├── core/
│   │   ├── models/
│   │   ├── routes/
│   │   ├── services/
│   │   └── workers/
│   ├── scripts/
│   ├── main.py
│   ├── requirements.txt
│   ├── Dockerfile
│   └── docker-compose.yml
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── lib/
│   │   ├── messages/
│   │   ├── store/
│   │   └── types/
│   └── package.json
├── database.md
├── ARCHITECTURE_SUMMARY.md
└── README.md
```

---

## Backend Architecture

### Runtime Entry Point

`backend/main.py` creates the FastAPI application and wires:

- **Lifespan startup/shutdown:** optional database bootstrap and database engine disposal
- **CORS:** allowed origins from `settings.ALLOWED_ORIGINS`
- **Rate limiting:** SlowAPI middleware and handler
- **Routers:** auth, products, inventory, transactions, AI chat, categories, dashboard, and locations
- **Static files:** local `/uploads` mount when `STORAGE_BACKEND=local`
- **Health routes:** `/livez` and `/readyz`

### Backend Layers

| Layer | Location | Responsibility |
|---|---|---|
| Config | `app/core/config.py` | Environment-driven settings, production validation, storage/database/AI configuration |
| Database | `app/core/database.py` | Async SQLAlchemy engine, session factory, `get_db`, schema bootstrap |
| Security | `app/core/security.py` | Password hashing and JWT encode/decode |
| Dependencies | `app/core/dependencies.py` | Current user and admin authorization dependencies |
| Schemas | `app/core/schemas.py` | Pydantic request/response contracts |
| Models | `app/models/` | SQLAlchemy ORM tables and relationships |
| Routes | `app/routes/` | HTTP endpoints, validation, ownership checks, route-level orchestration |
| Services | `app/services/` | AI agent, demo reset, storage service, queue helpers |
| Workers | `app/workers/` | arq worker settings and background worker entry point |

### Backend Directory Detail

```text
backend/app/
├── core/
│   ├── config.py
│   ├── database.py
│   ├── dependencies.py
│   ├── emails.py
│   ├── health.py
│   ├── limiter.py
│   ├── schemas.py
│   ├── security.py
│   └── utils.py
├── models/
│   ├── category.py
│   ├── inventory.py
│   ├── location.py
│   ├── product.py
│   ├── transaction.py
│   └── user.py
├── routes/
│   ├── ai_chat.py
│   ├── auth.py
│   ├── categories.py
│   ├── dashboard.py
│   ├── inventory.py
│   ├── locations.py
│   ├── products.py
│   └── transactions.py
├── services/
│   ├── ai_agent_service.py
│   ├── demo_service.py
│   ├── queue.py
│   └── storage_service.py
└── workers/
    └── arq_worker.py
```

---

## Backend API Surface

| Prefix / Route | File | Purpose |
|---|---|---|
| `/api/auth/register` | `auth.py` | Register a new user |
| `/api/auth/login` | `auth.py` | Authenticate and return JWT + user profile |
| `/api/auth/logout` | `auth.py` | Logout and reset demo data for demo account |
| `/api/auth/me` | `auth.py` | Get/update current user profile |
| `/api/auth/upload-image` | `auth.py` | Upload current user's profile image |
| `/api/auth/forgot-password` | `auth.py` | Send reset password email if account exists |
| `/api/auth/change-password` | `auth.py` | Change current user's password |
| `/api/products` | `products.py` | Product create/list/read/update/delete |
| `/api/products/sku/{sku}` | `products.py` | Lookup product by SKU for current user |
| `/api/inventory` | `inventory.py` | Inventory create/list/read |
| `/api/inventory/locations` | `inventory.py` | List location names for current user |
| `/api/transactions` | `transactions.py` | Transaction create/list/read |
| `/api/categories` | `categories.py` | Category list/create/update/delete |
| `/api/locations` | `locations.py` | Location list/create/update/delete |
| `/api/dashboard/stats` | `dashboard.py` | Main dashboard cards |
| `/api/dashboard/sales-chart` | `dashboard.py` | Sales/cost/profit chart data |
| `/api/dashboard/metrics` | `dashboard.py` | Warehouse capacity usage |
| `/api/ai/chat` | `ai_chat.py` | Direct AI chat response |
| `/livez` | `main.py` | Process liveness |
| `/readyz` | `main.py` | Database and Groq readiness |

---

## Database Architecture

The current schema is documented in detail in `database.md`.

### Main Tables

| Table | Purpose |
|---|---|
| `users` | Authentication, roles, profile, image URL |
| `products` | Product master data, owner, SKU, category text, pricing, unit, image |
| `categories` | Per-user category names |
| `locations` | Per-user warehouse locations with capacity |
| `inventory` | Product stock by location |
| `transactions` | Stock movement and financial history |

### Ownership Strategy

OptiTrack is multi-tenant at the user level:

- **Direct owner filter:** `products.owner_id`, `categories.owner_id`, `locations.owner_id`
- **Transaction owner filter:** `transactions.user_id`
- **Inventory owner filter:** join `inventory` to `products` and filter `products.owner_id`

### Important Data Model Notes

- **Inventory location reference:** stored as a location name string, not a `location_id` FK.
- **Product category reference:** stored as text, not a `category_id` FK.
- **Per-owner uniqueness:** SKU, category name, and location name are enforced in route logic.
- **Location capacity:** inventory creation and stock-increasing transactions validate projected capacity.
- **Profile images:** database stores URL/path only; files live in local uploads or S3/MinIO.

---

## Core Business Flows

### Authentication Flow

```text
Login form
  -> POST /api/auth/login
  -> backend verifies bcrypt password
  -> backend returns JWT bearer token and user profile
  -> frontend stores token and user in localStorage
  -> axios request interceptor attaches Authorization: Bearer <token>
```

Invalid or expired tokens produce `401`; the frontend API interceptor clears local auth data and redirects to `/login`.

Current signup behavior:

- The signup page sends `role: 'ADMIN'` by default.
- The UI does not expose a role selector.
- Admin-only backend dependencies remain in place for protected write operations.

### Product Flow

- Product create requires authenticated user.
- Product update/delete requires admin user.
- SKU is checked per current user.
- Product price validation prevents `sell_price < cost_price`.
- The Products page supports USD, THB, and EUR input conversion before sending base numeric prices to the backend.

### Inventory Flow

- Inventory rows are created for a product and a location.
- The product must belong to the current user.
- The location name must exist for the current user.
- One product can have only one inventory row per location.
- Projected location stock cannot exceed `locations.capacity`.

### Transaction Flow

```text
POST /api/transactions
  -> validate product ownership
  -> validate location exists for user
  -> choose unit price from product
  -> create transaction with generated ref_code
  -> update or create inventory row
  -> recalculate inventory status
  -> commit transaction and stock change together
```

Transaction types:

- **INBOUND:** add stock, use product `cost_price`
- **OUTBOUND:** subtract stock, use product `sell_price`, validate sufficient stock
- **ADJUST:** set stock to exact quantity, use product `cost_price`

Frontend transaction UX:

- **Selected stock preview:** the new transaction modal shows the selected product's current stock at the selected location.
- **Inbound preview:** displays inbound quantity and projected stock after receiving items.
- **Outbound preview:** displays outbound quantity, projected items left, and a shortage warning before submit.
- **Backend authority:** frontend preview is informational; backend transaction validation still enforces ownership, location validity, capacity, and sufficient stock.

### Location Flow

- Locations belong to users and include `capacity`.
- Renaming a location updates matching inventory and transaction location strings.
- Capacity cannot be set lower than current stock.
- Locations with inventory or transaction references cannot be deleted.

---

## Storage Architecture

Profile image upload is handled through `app/services/storage_service.py`.

### Supported Backends

| Backend | Config | Behavior |
|---|---|---|
| Local | `STORAGE_BACKEND=local` | Saves to `LOCAL_UPLOAD_DIR` and serves through `/uploads` |
| S3/MinIO | `STORAGE_BACKEND=s3` | Uploads via `aioboto3` to `S3_BUCKET` |

### Upload Flow

```text
Profile page file input
  -> api.uploadProfileImage(file)
  -> POST /api/auth/upload-image multipart/form-data
  -> StorageService validates MIME type and size
  -> local filesystem or S3 upload
  -> users.image_url updated
  -> frontend stores updated user profile
```

Supported MIME types:

- `image/jpeg`
- `image/png`
- `image/webp`
- `image/gif`

Default max upload size is 5 MB.

---

## AI Features Architecture

### Current AI Chat Flow

AI chat is currently direct and synchronous:

```text
AIChatWidget
  -> api.sendChatMessage()
  -> POST /api/ai/chat
  -> ai_chat.py extracts current user and history
  -> AIAgentService.chat()
  -> Groq tool-calling loop
  -> read-only SQLAlchemy queries
  -> final text response
```

The route `app/routes/ai_chat.py` stays thin. The AI implementation lives in `app/services/ai_agent_service.py`.

### AI Tool Design

All AI tools are read-only data retrieval functions scoped to `user_id`.

| Tool | Purpose |
|---|---|
| `get_inventory_summary` | Overall inventory and value summary |
| `get_low_stock_items` | Products below minimum stock |
| `get_recent_transactions` | Recent stock movement history |
| `get_warehouse_value` | Financial value, cost, revenue, profit metrics |
| `search_products` | Product lookup by name, SKU, or category |
| `get_sales_analytics` | Sales performance over a selected period |
| `get_category_breakdown` | Inventory grouped by category |
| `get_location_stock` | Stock quantities by location |

### AI Isolation Rules

- AI does not create, update, or delete warehouse records.
- AI tools must filter by authenticated user data.
- Core WMS routes do not depend on AI.
- If Groq is unavailable or not configured, core inventory/product/transaction features still work.
- The frontend widget is user-triggered and only displays assistant responses.

---

## Frontend Architecture

### Next.js App Structure

```text
frontend/src/
├── app/
│   ├── layout.tsx
│   └── [locale]/
│       ├── ClientLayout.tsx
│       ├── dashboard/page.tsx
│       ├── inventory/page.tsx
│       ├── login/page.tsx
│       ├── page.tsx
│       ├── products/page.tsx
│       ├── profile/page.tsx
│       ├── signup/page.tsx
│       └── transactions/page.tsx
├── components/
│   ├── AIChatWidget.tsx
│   ├── Sidebar.tsx
│   ├── layout/
│   ├── modals/
│   └── ui/
├── hooks/
├── lib/
├── messages/
├── store/
└── types/
```

### Pages

| Page | Purpose |
|---|---|
| `/dashboard` | Overview cards, inventory flow, capacity and analytics |
| `/inventory` | Stock list filtered by selected warehouse location |
| `/products` | Product list plus add/edit product modal |
| `/transactions` | Transaction list and stock movement creation |
| `/profile` | Profile information and profile image upload |
| `/login` | Authentication |
| `/signup` | Registration |

### API Integration

`src/lib/api.ts` defines a shared Axios client:

- Base URL from `NEXT_PUBLIC_API_URL`, fallback `http://localhost:8000`
- JWT bearer token injected from `localStorage.token`
- `401` response handler clears auth state and redirects to `/login`
- Centralized methods for auth, profile upload, products, inventory, locations, transactions, dashboard, AI chat, and categories

### API Contract Boundary

- Backend request/response contracts are defined in `backend/app/core/schemas.py`.
- Frontend shared interfaces live in `frontend/src/types/index.ts`.
- Page-local interfaces are used where a page only needs a narrow subset of the backend response.
- When backend schemas change, frontend shared types and page-local types must be updated together.

### Frontend State

| Store / Hook | Responsibility |
|---|---|
| `useLocationStore` | Selected location and available warehouse location names |
| `useCurrencyStore` | Selected currency, exchange rates, fallback USD rates |
| `useUIStore` | Mobile menu open/closed state |
| `useCurrencyFormatter` | Currency conversion and display helpers |
| `useAuth` | Local token/user auth state |
| `useProducts`, `useInventory`, `useTransactions` | Data fetching helpers for WMS resources |
| `useAIChat` | Direct AI chat request state |

### UI Composition

- **Sidebar:** navigation, location selector, currency selector, current user profile, logout
- **AIChatWidget:** floating assistant with quick actions, Markdown table rendering, profile-aware user avatar
- **Profile page:** profile photo upload and editable name/account form
- **Products page:** add/edit form with currency dropdowns for cost and sell price
- **Transactions page:** new transaction modal previews current stock and projected stock after inbound/outbound movement
- **UI components:** local `button`, `input`, `label`, `alert`, `card`, `dialog`, `select`, `dropdown-menu`, and date picker components

---

## Frontend-Backend Interaction Flow

```text
Browser / Next.js
  -> Page or component event
  -> hook or direct page handler
  -> src/lib/api.ts Axios method
  -> JWT Authorization header
  -> FastAPI route
  -> SQLAlchemy AsyncSession
  -> PostgreSQL
```

AI chat follows a separate read-only path:

```text
AIChatWidget
  -> /api/ai/chat
  -> AIAgentService
  -> Groq
  -> read-only database tools
  -> response text
```

---

## Security Architecture

### Authentication

- JWT bearer tokens are generated on login.
- Frontend stores the token in `localStorage`.
- Axios adds `Authorization: Bearer <token>` to API requests.
- Passwords are stored as bcrypt hashes.
- Login and registration are rate-limited.

### Authorization

- `get_current_user` validates token, loads user, and rejects inactive users.
- `get_current_admin_user` protects admin-only actions.
- Current active application role is `ADMIN`; this is the role assigned by the signup UI.
- Legacy non-admin enum values still exist in shared model/schema/type definitions for compatibility, but they are not exposed in the current UI and are not part of the active project permission flow.

### Data Isolation

- Product, category, and location queries filter by `owner_id`.
- Inventory queries join to `products` and filter by `products.owner_id`.
- Transaction queries filter by `transactions.user_id` and/or joined product owner.
- AI tools receive `user_id` and must only return current-user data.

### Production Validation

When `ENVIRONMENT=production`, settings validation enforces:

- Strong non-placeholder `SECRET_KEY`
- Explicit non-localhost `ALLOWED_ORIGINS`
- Non-default local Postgres credentials
- `INIT_DB_ON_STARTUP=False`
- Required S3 settings when `STORAGE_BACKEND=s3`

---

## Docker Architecture

`backend/docker-compose.yml` defines a local decoupled stack:

| Service | Purpose | Exposed Ports |
|---|---|---|
| `api` | FastAPI app served by Gunicorn/Uvicorn | `8000:8000` |
| `db-init` | One-shot schema bootstrap with `python -m scripts.init_db` | none |
| `worker` | arq worker process | none |
| `db` | PostgreSQL using `pgvector/pgvector:pg16` | `5433:5432` |
| `redis` | Redis for queue/runtime support | `6379:6379` |
| `minio` | S3-compatible object storage | `9000:9000`, `9001:9001` |
| `minio-init` | Creates and exposes the `optitrack` bucket | none |

Docker API/worker configuration uses Compose DNS names:

- `DATABASE_URL=postgresql+asyncpg://postgres:postgrespassword@db:5432/optitrack_wms`
- `REDIS_URL=redis://redis:6379/0`
- `STORAGE_BACKEND=s3`
- `S3_ENDPOINT_URL=http://minio:9000`
- `S3_PUBLIC_URL_BASE=http://localhost:9000/optitrack`
- `S3_BUCKET=optitrack`

---

## Health and Operations

| Endpoint | Purpose |
|---|---|
| `/` | Basic API metadata |
| `/livez` | Liveness check without external dependency checks |
| `/readyz` | Database and Groq readiness check |

Operational notes:

- Database connections are closed during application shutdown.
- Local uploads are served by FastAPI only when `STORAGE_BACKEND=local`.
- Demo account data resets on login/logout for `admin@optitrack.com`.
- The backend can start without Groq for non-AI functionality; readiness treats Groq as valid when skipped.

---

## Summary

OptiTrack currently follows a layered architecture:

1. **Frontend UI layer:** Next.js pages, reusable components, Zustand UI/global state, Axios API client
2. **Backend route layer:** FastAPI routers with authentication, validation, and owner checks
3. **Backend service layer:** AI agent, profile image storage, demo data reset, queue helpers
4. **Data layer:** SQLAlchemy async ORM over PostgreSQL
5. **Infrastructure layer:** Dockerized API, PostgreSQL, Redis, MinIO, one-shot DB init, and optional worker

The AI assistant is an optional read-only module. Core WMS workflows such as products, locations, inventory, transactions, dashboard analytics, authentication, and profile management operate independently of the AI system.
