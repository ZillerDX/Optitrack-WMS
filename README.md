# OptiTrack WMS

> **Enterprise-Grade Intelligent Warehouse Management System (WMS) & Digital Twin**

[![Live Demo](https://img.shields.io/badge/Live%20Demo-optitrackwms.vercel.app-0070f3?style=for-the-badge&logo=vercel)](https://optitrackwms.vercel.app)
[![Next.js](https://img.shields.io/badge/Next.js-14_App_Router-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL_%26_Auth-3ECF8E?style=for-the-badge&logo=supabase)](https://supabase.com/)
[![FastAPI](https://img.shields.io/badge/FastAPI-Python_3.11-009688?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com/)

👉 **Live Production URL**: [https://optitrackwms.vercel.app](https://optitrackwms.vercel.app)

---

## 📌 Project Overview

**OptiTrack WMS** is a modern, high-velocity warehouse operations platform engineered for precision stock visibility, space optimization, and autonomous inventory replenishment. It bridges physical warehouse floor operations with executive analytics via real-time SCADA digital twins and autonomous AI intelligence.

### Key Capabilities

- 🏢 **2D / 3D Interactive Warehouse Digital Twin**:
  - Switch between architectural **2D CAD Blueprint** and **3D Isometric Projection** views.
  - Multi-tier industrial pallet racks (Ground Heavy T1, Pick-Level T2, High-Bay T3) with real-time density heatmaps ($0\%$ Empty to $>90\%$ Critical).
  - Interactive rack inspection drawer, live SKU spotlighting, and quick inbound routing.
- 🤖 **Autonomous AI Predictive Inventory & Reorder Agent**:
  - Detects 30-day outbound velocity ($V = \text{Outbound}/30$) and Days of Inventory (DOI) run-out dates.
  - Generates automated Draft Purchase Orders (POs) with recommended quantities.
  - **1-Click PO Approval Workflow**: Records POs in Supabase, atomically logs `INBOUND` transactions, and updates stock balances.
- 📊 **1-Click AI Executive Intelligence Report**:
  - Instant executive diagnostics on the Dashboard synthesizing operational readiness (Grade A–D), tied-up capital vs gross valuation, zone headroom, and prioritized action playbooks.
- 📦 **End-to-End Inventory & Ledger Management**:
  - Multi-location tracking across custom warehouse zones and bins.
  - Immutable stock transaction ledger (`INBOUND`, `OUTBOUND`, `ADJUST`).
  - Printable vector barcode label generator with SKU tags.
  - Real-time multi-currency conversions and bilingual support (EN / TH).

---

## 🛠️ Tech Stack

| Layer | Technologies |
|---|---|
| **Frontend Framework** | [Next.js 14](https://nextjs.org/) (App Router), [React 18](https://react.dev/), [TypeScript](https://www.typescriptlang.org/) |
| **Styling & Design** | [Tailwind CSS](https://tailwindcss.com/), Radix UI primitives, [Lucide Icons](https://lucide.dev/), Dark Glassmorphism |
| **State & Data** | [Zustand](https://github.com/pmndrs/zustand), Axios, [Recharts](https://recharts.org/), [date-fns](https://date-fns.org/) |
| **Backend & Database** | [Supabase](https://supabase.com/) (PostgreSQL with RLS, Auth, REST, Storage), [FastAPI](https://fastapi.tiangolo.com/) (Python 3.11+, SQLAlchemy 2.0 Async, Pydantic v2) |
| **AI Intelligence** | Google Gemini 2.5 Flash / Flash-Lite & Groq (LLaMA 3.3) with resilient multi-provider fallback |
| **DevOps & Infra** | [Vercel](https://vercel.com/) (Edge/Serverless), Docker Compose, PostgreSQL 15, Redis, MinIO |

---

## 📂 Annotated Folder Tree

```text
Optitrack-WMS/
├── backend/                        # Python FastAPI microservices & database schemas
│   ├── alembic/                    # Database migration version scripts
│   ├── app/                        # Application core, models, schemas, and endpoints
│   │   ├── api/                    # REST routes (auth, products, inventory, transactions)
│   │   ├── core/                   # Security, JWT, configuration, and caching
│   │   ├── models/                 # SQLAlchemy 2.0 async ORM models
│   │   └── services/               # Stock ledger, allocation, and audit services
│   ├── supabase/migrations/        # Production Supabase SQL migrations (e.g. purchase_orders)
│   ├── Dockerfile                  # Container definition for FastAPI backend
│   └── requirements.txt            # Python dependencies
│
├── frontend/                       # Next.js 14 client application
│   ├── public/                     # Static assets, icons, and PWA manifest
│   └── src/
│       ├── app/                    # Next.js App Router routes
│       │   ├── [locale]/           # Localized pages (dashboard, inventory, products, transactions)
│       │   └── api/                # Edge/Serverless Next.js API endpoints
│       │       ├── ai/             # AI endpoints (predictive reorder, intelligence report, chat)
│       │       ├── auth/           # Authentication & Google OAuth handlers
│       │       └── inventory/      # Live inventory sync routes
│       ├── components/             # Reusable UI component library
│       │   ├── modals/             # Centered modals (ConfirmModal, NotificationModal, BarcodeModal)
│       │   ├── AIAnalyseReportModal.tsx        # 1-Click executive operations intelligence report
│       │   ├── AIChatWidget.tsx                # Autonomous AI operations copilot widget
│       │   ├── PredictiveReorderAgentModal.tsx # Autonomous draft PO & replenishment modal
│       │   └── WarehouseLayoutVisualizer.tsx   # 2D/3D SCADA digital twin & density heatmap
│       ├── hooks/                  # Custom React hooks (currency, inventory, auth, transactions)
│       ├── lib/                    # Utilities, API client, Supabase client, and translations
│       ├── messages/               # Bilingual i18n dictionaries (en.json, th.json)
│       └── store/                  # Zustand global stores (location, currency, UI)
│
├── docker-compose.yml              # Multi-container orchestration (FastAPI, Postgres, Redis, MinIO)
└── README.md                       # Repository documentation
```

---

## ⚡ Commands & Getting Started

### 1. Web Application (Next.js Frontend)

```bash
cd frontend

# Install dependencies
npm install

# Run local development server (http://localhost:3000)
npm run dev

# Compile production build
npm run build

# Run production server
npm run start

# Lint & typecheck
npm run lint
```

### 2. Full Local Stack (Docker Compose)

Runs the entire stack locally (Frontend, FastAPI Backend, PostgreSQL, Redis, and MinIO):

```bash
# Clone the repository
git clone https://github.com/ZillerDX/Optitrack-WMS.git
cd Optitrack-WMS

# Start all containers in detached mode
docker compose up --build -d

# View real-time container logs
docker compose logs -f

# Shut down containers
docker compose down

# Shut down and wipe persistent volumes
docker compose down -v
```

### 3. Local Port Reference

| Service | Port / URL | Description |
|---|---|---|
| **Web Frontend** | `http://localhost:3000` | Next.js 14 Web Application |
| **API Backend** | `http://localhost:8000` | FastAPI REST API |
| **Interactive Docs** | `http://localhost:8000/docs` | Swagger UI OpenAPI specifications |
| **PostgreSQL** | `localhost:5433` | Local database instance |
| **Redis** | `localhost:6379` | Task queue & cache store |
| **MinIO Console** | `http://localhost:9001` | S3-compatible object storage console |

---

## 🌐 Deployment

- **Production Deployment**: Automated CI/CD through Vercel connected to GitHub `main` branch.
- **Live Application**: [https://optitrackwms.vercel.app](https://optitrackwms.vercel.app)
