## Getting Started

### Prerequisites

- Node.js 18+
- Docker (for Supabase)
- Supabase CLI (`brew install supabase/tap/supabase`)

### 1. Start the Backend

Navigate to the `backend` directory and start Supabase:

```bash
cd backend
supabase start
```

This will spin up a local Supabase instance with Postgres, Auth, and other services. Note the API URL and Anon Key from the output.

You can access the **Supabase Studio** (Database Dashboard) at: [http://127.0.0.1:54323](http://127.0.0.1:54323)

### 2. Configure Frontend

Ensure your `frontend/.env.local` file has the correct Supabase credentials (these should match the output from `supabase start`):

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

### 3. Run the Frontend

Navigate to the `frontend` directory and start the development server:

```bash
cd frontend
npm run dev
```

Open [http://localhost:3002](http://localhost:3002) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
