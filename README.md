# OptiTrack WMS

OptiTrack WMS is a multi-tenant warehouse management system with a FastAPI backend, Next.js frontend, PostgreSQL, Redis, MinIO/S3-compatible storage, and an optional Groq-powered AI assistant.

## Quick Start

Install these first:

- **Git**
- **Docker Desktop**

Then run:

```bash
git clone https://github.com/ZillerDX/Optitrack-WMS.git
cd Optitrack-WMS
docker compose up --build
```

Open the app:

```text
http://localhost:3000
```

The first Docker build can take several minutes.

## Services

The single Docker command starts the full local stack:

| Service | URL |
|---------|-----|
| Frontend | `http://localhost:3000` |
| Backend API | `http://localhost:8000` |
| Swagger UI | `http://localhost:8000/docs` |
| PostgreSQL | `localhost:5433` |
| Redis | `localhost:6379` |
| MinIO API | `http://localhost:9000` |
| MinIO Console | `http://localhost:9001` |

## Features

- **Products and categories:** Manage product records, SKUs, prices, categories, and stock thresholds.
- **Inventory by location:** Track stock quantities, stock status, and warehouse locations.
- **Transactions:** Create inbound, outbound, and adjustment transactions with backend stock validation.
- **Dashboard analytics:** View inventory totals, sales data, storage usage, and low-stock items.
- **Profile image upload:** Store images through local/S3-compatible storage.
- **AI assistant:** Ask read-only warehouse questions when `GROQ_API_KEY` is configured.

## How to Get a Groq API Key

The project can run without a Groq API key, but AI chat responses require one.

1. Go to:

   ```text
   https://console.groq.com/
   ```

2. Sign in or create a Groq account.

3. Open the API Keys page.

4. Create a new API key.

5. Copy the key and set it before starting Docker Compose.

PowerShell:

```powershell
$env:GROQ_API_KEY = "your-groq-api-key"
docker compose up --build
```

Command Prompt:

```cmd
set GROQ_API_KEY=your-groq-api-key
docker compose up --build
```

Bash:

```bash
GROQ_API_KEY=your-groq-api-key docker compose up --build
```

Do not commit API keys or `.env` files to GitHub.

## Optional Local Environment Files

Docker Compose includes local development defaults, so `.env` files are not required for the normal quick start.

If you want custom values, copy the examples and edit the copied files only.

PowerShell:

```powershell
Copy-Item backend\.env.example backend\.env
Copy-Item frontend\.env.example frontend\.env.local
```

Command Prompt:

```cmd
copy backend\.env.example backend\.env
copy frontend\.env.example frontend\.env.local
```

macOS/Linux:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

These files are ignored by Git:

- `backend/.env`
- `frontend/.env.local`

## Useful Commands

Stop the stack:

```bash
docker compose down
```

Stop the stack and remove local database/storage volumes:

```bash
docker compose down -v
```

Rebuild after code changes:

```bash
docker compose up --build
```

View logs:

```bash
docker compose logs -f
```

## Tech Stack

### Backend

- Python 3.11+
- FastAPI
- SQLAlchemy 2.0 async
- PostgreSQL
- Redis and arq
- Pydantic v2
- JWT authentication
- Groq SDK
- aioboto3/botocore for S3-compatible storage

### Frontend

- Next.js 14 App Router
- React 18
- TypeScript
- Tailwind CSS
- Radix UI components
- Zustand
- Axios
- next-intl
- Recharts
- Lucide React

## Project Structure

```text
Optitrack-WMS/
├── backend/
│   ├── app/
│   ├── scripts/
│   ├── Dockerfile
│   ├── docker-compose.yml
│   ├── main.py
│   └── requirements.txt
├── frontend/
│   ├── public/
│   ├── src/
│   ├── Dockerfile
│   ├── next.config.js
│   └── package.json
├── docker-compose.yml
├── ARCHITECTURE_SUMMARY.md
├── database.md
└── README.md
```
## More Documentation

- Database details: `database.md`
- Architecture details: `ARCHITECTURE_SUMMARY.md`
