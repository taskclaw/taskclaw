# Backend API

This is the NestJS backend for the Microfactory Scaffold.

## Setup

1.  **Install Dependencies**:
    ```bash
    npm install
    ```

2.  **Environment Variables**:
    Copy `.env.example` to `.env` and fill in the values:
    ```bash
    cp .env.example .env
    ```
    Required variables:
    - `SUPABASE_URL`: Your Supabase Project URL.
    - `SUPABASE_KEY`: Your Supabase Anon Key (or Service Role Key if needed, but be careful).
    - `OPENROUTER_API_KEY`: Your OpenRouter API key for AI Assistant and embeddings.
    - `AI_MODEL`: AI model to use (e.g., `openai/gpt-4o-mini`).
    
    Optional (for Vector Search):
    - `EMBEDDING_MODEL`: Embedding model for vector search (default: `openai/text-embedding-3-small`).
    - `VECTOR_DIMENSIONS`: Embedding dimensions (default: `1536`).

3.  **Configure Supabase (First Time Only)**:
    To avoid port conflicts with other projects, run the setup wizard:
    ```bash
    npm run setup:supabase
    ```
    Follow the prompts to set a unique Project ID and Port range.

4.  **Run Development Server**:
    ```bash
    npm run start:dev
    ```
    The API will run on `http://localhost:3003`.

## Architecture

- **Framework**: NestJS
- **Database**: Supabase (via `@supabase/supabase-js`)
- **Auth**: Supabase Auth (JWT verification via `AuthGuard`)

## Modules

- **SupabaseModule**: Manages Supabase client connection.
- **UsersModule**: User profile management.
- **AccountsModule**: Account management.
