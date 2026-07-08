# GrowEasy CRM — AI-Powered CSV Importer

A responsive web application and Node.js backend system that allows users to upload lead CSV spreadsheets in **any** layout (Facebook Lead exports, Google Ads sheets, CRM exports) and uses AI to map, format, and structure the leads into the standard GrowEasy CRM format.

## Features

- **Messy Data Support**: Adapts to variable column names (e.g. "Mail ID" or "email_address" -> "email").
- **Automatic Field Extraction**: Maps custom statuses, notes, locations, and source fields automatically.
- **Pre-Filtering & validation**: Immediately screens out invalid entries (missing both email and phone) deterministically before making LLM calls to reduce tokens/costs.
- **CSV Compatibility**: Cleans dates (making them JavaScript `new Date()` compliant) and parses lists of emails/phones by taking the first and putting the rest into CRM notes.
- **Chunked Batch Processing**: Batches rows (default 15) to respect API rate limits and avoid prompt context overflows.
- **Fail-Safe & Retries**: Implements exponential backoff retries for failed batches, with a deterministic local fallback mapper if no API keys are provided.
- **Premium Responsive UI**: Built with custom Vanilla CSS featuring glassmorphic components, dark mode, responsive scrollable tables with sticky headers, progress indicators, and structured JSON/CSV export downloads.

---

## Workspace Structure

```
groweasy/
├── backend/                  # Node.js + Express + TypeScript server
│   ├── src/
│   │   ├── controllers/      # Route triggers and file validation
│   │   ├── routes/           # Endpoint definitions (POST /api/upload)
│   │   ├── services/         # CsvService (parse) & AiService (batches, prompt, retries)
│   │   └── tests/            # Custom integration test runner
│   ├── .env.example          # Environment variables template
│   └── tsconfig.json         # TypeScript compiler rules
│
├── frontend/                 # Next.js App Router (TypeScript) UI
│   ├── src/
│   │   └── app/
│   │       ├── globals.css   # Main stylesheet (Glassmorphism + Dark Mode CSS vars)
│   │       ├── layout.tsx    # SEO layout metadata wrapper
│   │       └── page.tsx      # Main application page (Step 1 -> Step 4 flow)
│   └── tsconfig.json         # TypeScript configurations
│
├── samples/                  # Messy sample lead sheets for testing
├── package.json              # Workspace-wide scripts orchestrator
└── .npmrc                    # HTTP registry configuration for local proxies
```

---

## Setup Instructions

### 1. Configure API Keys
Copy the example environment file inside `backend/` and paste your Gemini or OpenAI API keys:
```bash
cp backend/.env.example backend/.env
```
Open `backend/.env` and insert your credentials:
```env
PORT=5001
GEMINI_API_KEY=your-gemini-api-key-here
# OR
OPENAI_API_KEY=your-openai-api-key-here
```
*Note: If both keys are omitted, the backend will gracefully fallback to a local deterministic mapper so the application remains fully functional for testing.*

### 2. Install Dependencies
Run the install command in the root folder to download dependencies for both projects:
```bash
npm run install:all
```

### 3. Run the Application
Launch both the backend server and frontend application concurrently:
```bash
npm run dev
```
- **Frontend URL**: [http://localhost:3000](http://localhost:3000)
- **Backend URL**: [http://localhost:5001](http://localhost:5001)

### 4. Run Automated Tests
Execute the integration test suite to verify CSV parsing and CRM mapping rules:
```bash
npm run test --prefix backend
```

### 5. Running with Docker (Alternative)
You can build and launch both services inside Docker containers using:
```bash
# Set environment variables and run
GEMINI_API_KEY=your_key docker-compose up --build
```
- **Frontend URL**: [http://localhost:3000](http://localhost:3000)
- **Backend URL**: [http://localhost:5001](http://localhost:5001)

---

## Vercel Deployment Guide

You can deploy both the Next.js frontend and the Express backend serverless functions on Vercel.

### Step 1: Deploy the Backend
1. Install Vercel CLI globally or use `npx vercel` inside the `backend/` directory:
   ```bash
   cd backend
   vercel
   ```
2. Link your Vercel account and set up a new project (e.g. `groweasy-api`).
3. Set your environment variables in the Vercel Dashboard (under Project Settings -> Environment Variables):
   - `GEMINI_API_KEY`: Your Gemini API Key
   - `OPENAI_API_KEY`: Your OpenAI API Key (if using OpenAI instead)
4. Run `vercel --prod` to deploy to production. Note down the deployed API URL (e.g. `https://groweasy-api.vercel.app`).

### Step 2: Deploy the Frontend
1. Open a terminal inside the `frontend/` directory:
   ```bash
   cd frontend
   vercel
   ```
2. Set up a new project (e.g. `groweasy-crm`).
3. Set your frontend environment variables in the Vercel Dashboard:
   - `NEXT_PUBLIC_API_URL`: Set this to your deployed Vercel backend URL (e.g., `https://groweasy-api.vercel.app`)
4. Run `vercel --prod` to deploy the frontend. Your app will be live at `https://groweasy-crm.vercel.app`.

