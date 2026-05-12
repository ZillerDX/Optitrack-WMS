# OptiTrack WMS Frontend

Production-ready Next.js 14 frontend for OptiTrack Warehouse Management System.

## Features

- **Next.js 14** with App Router
- **Dual Language Support** (Thai/English) with next-intl
- **Progressive Web App** (PWA) support
- **Responsive Design** with Tailwind CSS
- **AI Chat Interface** for warehouse analytics
- **Mobile-First** staff interface
- **TypeScript** for type safety
- **Shadcn/UI** components

## Tech Stack

- **Framework**: Next.js 14
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: Shadcn/UI, Radix UI
- **Icons**: Lucide React
- **Charts**: Recharts
- **i18n**: next-intl
- **PWA**: next-pwa
- **HTTP Client**: Axios

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

1. Install dependencies:
```bash
cd frontend
npm install
```

2. Create environment file:
```bash
cp .env.example .env.local
```

3. Update `.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

4. Run the development server:
```bash
npm run dev
```

The app will be available at `http://localhost:3000`

## Project Structure

```
frontend/
├── src/
│   ├── app/
│   │   ├── [locale]/          # Localized routes
│   │   │   ├── dashboard/     # Admin dashboard
│   │   │   ├── mobile/        # Staff mobile interface
│   │   │   ├── login/         # Login page
│   │   │   └── layout.tsx     # Main layout
│   │   └── globals.css        # Global styles
│   ├── components/
│   │   ├── ui/                # Shadcn/UI components
│   │   ├── Sidebar.tsx        # Navigation sidebar
│   │   ├── LanguageSwitcher.tsx
│   │   └── AIChatWidget.tsx   # AI assistant
│   ├── lib/
│   │   ├── api.ts             # API client
│   │   └── utils.ts           # Utility functions
│   ├── messages/
│   │   ├── en.json            # English translations
│   │   └── th.json            # Thai translations
│   ├── i18n.ts                # i18n configuration
│   └── middleware.ts          # Next.js middleware
├── public/
│   └── manifest.json          # PWA manifest
├── next.config.js
├── tailwind.config.js
└── package.json
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run lint` - Run ESLint
- `npm run type-check` - Run TypeScript type checking

## Key Features

### Dual Language Support

The app supports Thai (default) and English. Switch languages using the globe icon in the navigation.

Routes are automatically prefixed with the locale:
- `/th/dashboard` - Thai version
- `/en/dashboard` - English version

### Role-Based Access

- **Admin**: Full access to dashboard, products, reports, settings
- **Staff**: Mobile-only interface for warehouse operations

### Progressive Web App

The app can be installed on mobile devices for offline usage:
1. Visit the site on mobile
2. Click "Add to Home Screen"
3. Use like a native app

### AI Assistant

Click the chat icon to interact with the AI assistant. Ask questions about:
- Inventory levels
- Low stock items
- Transaction history
- Warehouse analytics

## Environment Variables

- `NEXT_PUBLIC_API_URL` - Backend API URL (default: http://localhost:8000)

## Building for Production

```bash
npm run build
npm start
```

## Deployment

The app can be deployed to:
- **Vercel** (recommended for Next.js)
- **Netlify**
- **Docker** (use the provided Dockerfile)
- Any Node.js hosting platform

## License

Proprietary - OptiTrack WMS
