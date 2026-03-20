# Authentication & Authorization

> Status: Production-ready  
> Stack: Supabase Auth, JWT, NestJS Guards, PostgreSQL RLS  
> Related Docs: [Multi-Tenancy](./multi-tenancy.md), [User Management](./user-management.md), [Database Architecture](./database-architecture.md)

## Overview & Key Concepts

The scaffold implements a robust authentication and authorization system that secures both the frontend and backend layers. It combines **Supabase Authentication** for user identity management with a **multi-layered authorization system** that enforces permissions at the API level (Guards), service level (AccessControlHelper), and database level (RLS policies).

### Key Concepts

- **Authentication**: Verifying user identity (who are you?)
- **Authorization**: Verifying user permissions (what can you do?)
- **JWT (JSON Web Tokens)**: Stateless tokens that carry user identity and metadata
- **RLS (Row-Level Security)**: Database-level access control that filters queries automatically
- **Guards**: NestJS middleware that protects API endpoints
- **Role-Based Access Control (RBAC)**: Permissions assigned based on user roles
- **User Status Workflow**: Lifecycle management (Active, Pending, Suspended)

### Core Components

1. **Supabase Auth** - Identity provider (email/password, OAuth)
2. **Auth

Guard** - JWT validation + user status enforcement
3. **AdminGuard** - Super admin role verification
4. **RLS Policies** - Database-level multi-tenant isolation
5. **User Status System** - Account approval workflow

---

## Architecture & How It Works

### Authentication Flow

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Backend
    participant Supabase
    participant Database

    User->>Frontend: Enter credentials
    Frontend->>Supabase: signInWithPassword()
    Supabase->>Database: Verify credentials
    Database->>Supabase: User found
    Supabase->>Frontend: Return JWT + Session
    Frontend->>Backend: API call with JWT
    Backend->>Backend: AuthGuard validates JWT
    Backend->>Database: Check user status
    Database->>Backend: Status: active
    Backend->>Frontend: API response
```

### Authorization Layers

```mermaid
graph TB
    Request[API Request with JWT] --> Layer1[Layer 1: AuthGuard]
    Layer1 -->|Valid JWT?| Layer2[Layer 2: User Status Check]
    Layer2 -->|Active?| Layer3[Layer 3: AdminGuard optional]
    Layer3 -->|Super Admin?| Layer4[Layer 4: Service Layer]
    Layer4 -->|AccessControlHelper| Layer5[Layer 5: Database RLS]
    Layer5 --> Response[Filtered Data Response]
    
    Layer1 -->|Invalid| Reject1[401 Unauthorized]
    Layer2 -->|Pending/Suspended| Reject2[401 Unauthorized]
    Layer3 -->|Not Admin| Reject3[403 Forbidden]
    Layer4 -->|No Permission| Reject4[403 Forbidden]
    Layer5 -->|RLS Filter| EmptyResult[Empty Result Set]
```

### Role Hierarchy

```mermaid
graph TD
    SuperAdmin[Super Admin] -->|System-wide access| AllAccounts[All Accounts]
    AllAccounts --> Account1[Account 1]
    AllAccounts --> Account2[Account 2]
    
    Account1 --> Owner1[Owner]
    Account1 --> Admin1[Admin]
    Account1 --> Member1[Member]
    
    Owner1 -->|Full control| Projects1[All Projects]
    Admin1 -->|Manage + Invite| Projects1
    Member1 -->|View only| Projects1
    
    Projects1 --> ProjectAdmin[Project Admin]
    Projects1 --> ProjectEditor[Project Editor]
    Projects1 --> ProjectViewer[Project Viewer]
```

---

## Implementation Details

### Directory Structure

```
backend/src/
├── auth/
│   ├── auth.module.ts           # Auth module registration
│   ├── auth.controller.ts       # Login, signup, logout endpoints
│   ├── auth.service.ts          # Auth business logic
│   └── dto/
│       └── auth.dto.ts          # Login, signup DTOs
├── common/
│   └── guards/
│       ├── auth.guard.ts        # JWT validation + status check
│       └── admin.guard.ts       # Super admin role check
└── supabase/
    └── supabase.service.ts      # Supabase client management

frontend/src/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx       # Login form
│   │   ├── signup/page.tsx      # Signup form
│   │   ├── forgot-password/     # Password reset
│   │   └── actions.ts           # Server actions for auth
│   └── auth/
│       └── callback/
│           └── route.ts         # OAuth callback handler
└── lib/
    └── auth.ts                  # Auth utilities
```

### Key Files Walkthrough

#### 1. AuthGuard (`backend/src/common/guards/auth.guard.ts`)

The AuthGuard is the primary gatekeeper for all protected API endpoints.

```typescript
@Injectable()
export class AuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException();
    }

    // 1. Validate JWT with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      throw new UnauthorizedException();
    }

    // 2. Attach user to request
    request['user'] = user;

    // 3. Check user status (Active, Pending, Suspended)
    const { data: profile } = await adminSupabase
      .from('users')
      .select('status')
      .eq('id', user.id)
      .single();

    if (profile?.status !== 'active') {
      throw new UnauthorizedException('Account pending approval or suspended');
    }

    return true;
  }
}
```

**Key Features:**
- Extracts JWT from `Authorization: Bearer <token>` header
- Validates token with Supabase Auth
- Enforces user status check (blocks pending/suspended users)
- Attaches user object to request for downstream use

#### 2. AdminGuard (`backend/src/common/guards/admin.guard.ts`)

Ensures only Super Admins can access sensitive endpoints.

```typescript
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    const role = user.app_metadata?.role;

    if (role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Access denied. Requires SUPER_ADMIN role.');
    }

    return true;
  }
}
```

**Usage Pattern:**
```typescript
@Controller('admin/users')
@UseGuards(AuthGuard, AdminGuard)  // AuthGuard MUST come first
export class AdminUsersController {
  // Only super admins can access these endpoints
}
```

#### 3. AuthService (`backend/src/auth/auth.service.ts`)

Handles authentication operations (login, signup, password reset).

```typescript
@Injectable()
export class AuthService {
  async login(loginDto: LoginDto) {
    const supabase = this.supabaseService.getClient();

    // 1. Authenticate with Supabase
    const { data, error } = await supabase.auth.signInWithPassword({
      email: loginDto.email,
      password: loginDto.password,
    });

    if (error) {
      throw new UnauthorizedException(error.message);
    }

    // 2. Check user status
    const { data: profile } = await admin
      .from('users')
      .select('status')
      .eq('id', data.user.id)
      .single();

    if (profile?.status !== 'active') {
      throw new UnauthorizedException('Account pending approval or suspended');
    }

    return data.session;  // Contains JWT
  }

  async signup(signupDto: SignupDto) {
    const supabase = this.supabaseService.getClient();

    // 1. Create auth user
    const { data, error } = await supabase.auth.signUp({
      email: signupDto.email,
      password: signupDto.password,
      options: {
        data: { full_name: signupDto.name },
      },
    });

    // 2. Set user status to 'pending'
    await admin.from('users').upsert({
      id: data.user.id,
      email: signupDto.email,
      name: signupDto.name,
      status: 'pending',  // Requires admin approval
    });

    return data.session;
  }
}
```

#### 4. Frontend Auth Actions (`frontend/src/app/(auth)/actions.ts`)

Server actions that call backend auth endpoints.

```typescript
'use server';

export async function login(prevState: any, formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    return { error: await response.text() };
  }

  const session = await response.json();
  
  // Store JWT in cookies (httpOnly for security)
  cookies().set('access_token', session.access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: session.expires_in,
  });

  redirect('/dashboard');
}
```

---

## API Reference

### Backend Endpoints

#### POST `/auth/login`
Authenticate user with email and password.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Response (200):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in": 3600,
  "refresh_token": "...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "app_metadata": { "role": "user" }
  }
}
```

**Errors:**
- `401` - Invalid credentials
- `401` - Account pending approval
- `401` - Account suspended

#### POST `/auth/signup`
Create new user account.

**Request Body:**
```json
{
  "email": "newuser@example.com",
  "password": "securePassword123",
  "name": "John Doe"
}
```

**Response (201):**
```json
{
  "access_token": "...",
  "user": {
    "id": "uuid",
    "email": "newuser@example.com",
    "user_metadata": { "full_name": "John Doe" }
  }
}
```

**Note:** New users are created with `status: 'pending'` and require admin approval.

#### POST `/auth/logout`
Sign out user (invalidates refresh token).

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response (200):**
```json
{
  "success": true
}
```

#### POST `/auth/reset-password`
Send password reset email.

**Request Body:**
```json
{
  "email": "user@example.com",
  "redirectTo": "http://localhost:3002/update-password"
}
```

**Response (200):**
```json
{
  "success": true
}
```

### Database Tables

#### `users` Table
User profile data (synced with `auth.users`).

```sql
CREATE TABLE users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE,
  name text,
  status text CHECK (status IN ('active', 'pending', 'suspended')) DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);
```

**Columns:**
- `id` - User UUID (matches auth.users)
- `email` - User email
- `name` - Display name
- `status` - Account status (active/pending/suspended)
- `created_at` - Signup timestamp

#### RLS Policies for `users`

```sql
-- Users can view their own profile
CREATE POLICY "Users can view own profile" ON users
  FOR SELECT USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (auth.uid() = id);
```

### Frontend Components

#### Login Page
Path: `frontend/src/app/(auth)/login/page.tsx`

```typescript
export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(login, null);

  return (
    <form action={formAction}>
      {state?.error && <Alert>{state.error}</Alert>}
      
      <Input name="email" type="email" required />
      <Input name="password" type="password" required />
      
      <Button type="submit" disabled={isPending}>
        {isPending ? 'Signing in...' : 'Sign In'}
      </Button>
    </form>
  );
}
```

---

## Configuration & Setup

### Environment Variables

**Backend (`backend/.env`):**
```bash
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key                    # Public anon key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key  # Admin access
```

**Frontend (`frontend/.env`):**
```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Backend API
NEXT_PUBLIC_API_URL=http://localhost:3003
```

### Initial Setup

1. **Create Supabase Project** at https://supabase.com
2. **Copy environment variables** from Supabase project settings
3. **Run database migrations** to create tables and RLS policies:
   ```bash
   cd backend
   npx supabase migration up
   ```
4. **Create Super Admin user** (optional):
   ```sql
   UPDATE auth.users
   SET raw_app_meta_data = 
     COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"role": "super_admin"}'::jsonb
   WHERE email = 'admin@example.com';
   ```

### User Status Configuration

Users can have three statuses:

- **`active`** - Can log in and access the system
- **`pending`** - Awaiting admin approval (default for new signups)
- **`suspended`** - Temporarily blocked from access

To approve a pending user:
```sql
UPDATE users SET status = 'active' WHERE id = 'user-uuid';
```

---

## Best Practices & Patterns

### 1. Always Use AuthGuard for Protected Routes

✅ **Good**: Protect all non-public endpoints
```typescript
@Controller('projects')
@UseGuards(AuthGuard)  // All routes in this controller are protected
export class ProjectsController {
  @Get()
  findAll(@Req() req: any) {
    const userId = req.user.id;  // Available after AuthGuard
    // ...
  }
}
```

❌ **Bad**: Unprotected endpoints
```typescript
@Controller('projects')
export class ProjectsController {
  @Get()
  findAll() {
    // Anyone can access this!
  }
}
```

### 2. AdminGuard Must Come After AuthGuard

✅ **Good**: Correct guard order
```typescript
@Controller('admin/users')
@UseGuards(AuthGuard, AdminGuard)  // AuthGuard first!
export class AdminUsersController {}
```

❌ **Bad**: Wrong order
```typescript
@UseGuards(AdminGuard, AuthGuard)  // AdminGuard won't have req.user
```

### 3. Store JWT in httpOnly Cookies

✅ **Good**: Secure cookie storage
```typescript
cookies().set('access_token', token, {
  httpOnly: true,         // JavaScript can't access
  secure: true,           // HTTPS only in production
  sameSite: 'lax',       // CSRF protection
  maxAge: 3600,          // 1 hour
});
```

❌ **Bad**: localStorage storage
```typescript
localStorage.setItem('token', token);  // Vulnerable to XSS
```

### 4. Check User Status on Every Login

✅ **Good**: Enforce status check
```typescript
async login(loginDto: LoginDto) {
  const { data } = await supabase.auth.signInWithPassword(loginDto);
  
  // Always check status
  const { data: profile } = await this.checkUserStatus(data.user.id);
  if (profile.status !== 'active') {
    throw new UnauthorizedException('Account not active');
  }
  
  return data.session;
}
```

❌ **Bad**: Skipping status check
```typescript
async login(loginDto: LoginDto) {
  const { data } = await supabase.auth.signInWithPassword(loginDto);
  return data.session;  // Pending users can log in!
}
```

### 5. Use RLS for Defense in Depth

Even with guards, always enable RLS policies.

✅ **Good**: Multiple layers of security
```typescript
// API Guard checks permissions
@UseGuards(AuthGuard)
async findAll(@Req() req: any) {
  // RLS policies automatically filter results
  return await supabase.from('projects').select('*');
}
```

### 6. Never Trust Client-Side Checks

❌ **Bad**: Client-side role check only
```typescript
// Frontend
if (user.role === 'admin') {
  // Show admin UI
}
```

✅ **Good**: Server-side enforcement
```typescript
// Backend
@UseGuards(AuthGuard, AdminGuard)
@Get('admin/settings')
getSettings() {
  // Only reachable by super admins
}
```

---

## Common Use Cases & Examples

### Use Case 1: User Registration with Approval Workflow

**Scenario**: New users sign up but need admin approval before accessing the system.

**Implementation:**

1. **User signs up** (status set to 'pending'):
```typescript
// Frontend action
const result = await signup(formData);
// User receives confirmation email
```

2. **Admin approves user**:
```typescript
// Backend endpoint (admin only)
@UseGuards(AuthGuard, AdminGuard)
@Patch('users/:id/approve')
async approveUser(@Param('id') userId: string) {
  await this.supabase
    .from('users')
    .update({ status: 'active' })
    .eq('id', userId);
  
  // Send welcome email
  await this.emailService.sendWelcomeEmail(userId);
  
  return { success: true };
}
```

3. **User tries to log in**:
```typescript
// If status is 'pending', login fails with message
// If status is 'active', login succeeds
```

### Use Case 2: Protecting Admin-Only Endpoints

**Scenario**: Create endpoints that only super admins can access.

**Implementation:**

```typescript
// Backend controller
@Controller('admin/system-settings')
@UseGuards(AuthGuard, AdminGuard)
export class SystemSettingsController {
  @Get()
  getSettings() {
    // Only super admins reach this
    return this.settingsService.findAll();
  }

  @Patch()
  updateSettings(@Body() dto: UpdateSettingsDto) {
    return this.settingsService.update(dto);
  }
}
```

**Frontend protection:**
```typescript
// Check user role before rendering admin nav
const user = await getUser();
const isSuperAdmin = user.app_metadata?.role === 'super_admin';

return (
  <Sidebar>
    {isSuperAdmin && (
      <NavItem href="/admin">Admin Panel</NavItem>
    )}
  </Sidebar>
);
```

### Use Case 3: Password Reset Flow

**Scenario**: User forgot password and needs to reset it.

**Implementation:**

1. **User requests reset**:
```typescript
// Frontend
async function requestReset(email: string) {
  await fetch(`${API_URL}/auth/reset-password`, {
    method: 'POST',
    body: JSON.stringify({
      email,
      redirectTo: `${FRONTEND_URL}/update-password`
    }),
  });
}
```

2. **Supabase sends email** with magic link

3. **User clicks link**, redirected to `/update-password?code=...`

4. **Exchange code for session**:
```typescript
// Frontend callback handler
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  if (code) {
    // Exchange code for session
    const response = await fetch(`${API_URL}/auth/exchange-code`, {
      method: 'POST',
      body: JSON.stringify({ code }),
    });

    const session = await response.json();
    
    // Store session
    cookies().set('access_token', session.access_token);
    
    // Redirect to password update form
    redirect('/update-password');
  }
}
```

5. **User updates password**:
```typescript
async function updatePassword(newPassword: string, token: string) {
  await fetch(`${API_URL}/auth/update-password`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ password: newPassword }),
  });
}
```

### Use Case 4: Multi-Tenant Data Access with RLS

**Scenario**: Users should only see projects in accounts they belong to.

**Implementation:**

RLS policy automatically filters results:

```sql
-- Policy on projects table
CREATE POLICY "Users see projects in their accounts" ON projects
  FOR SELECT USING (
    account_id IN (
      SELECT account_id FROM account_users 
      WHERE user_id = auth.uid()
    )
  );
```

Backend code doesn't need filtering logic:

```typescript
@UseGuards(AuthGuard)
@Get('projects')
async findAll(@Req() req: any) {
  // RLS automatically filters by user's accounts
  const { data } = await this.supabase
    .from('projects')
    .select('*');
  
  return data;  // Only projects user can access
}
```

---

## API Key Authentication

TaskClaw supports **API key authentication** as an alternative to JWT tokens for programmatic access. API keys are ideal for:

- **AI agents** (Claude Code, Cursor, MCP servers)
- **CI/CD pipelines** and automation
- **External integrations** and webhooks
- **Long-running processes** that need persistent auth

### API Key Format

All API keys follow this format:

```
tc_live_xxxxxxxxxxxxxxxxxxxxxxxxxx
```

- **Prefix**: `tc_live_` (production keys)
- **Length**: 32 characters after prefix
- **Encoding**: Base62 (alphanumeric)

### Key Scopes

API keys can be scoped to limit their permissions. Available scopes:

| Scope | Description | Grants Access To |
|-------|-------------|------------------|
| `boards:read` | Read boards and steps | GET /accounts/:id/boards, GET /accounts/:id/boards/:bid |
| `boards:write` | Create, update, delete boards | POST/PATCH/DELETE /accounts/:id/boards |
| `tasks:read` | Read tasks | GET /accounts/:id/tasks |
| `tasks:write` | Create, update, move, complete tasks | POST/PATCH/DELETE /accounts/:id/tasks |
| `conversations:read` | Read conversations and messages | GET /accounts/:id/conversations |
| `conversations:write` | Create conversations, send messages | POST /accounts/:id/conversations |
| `skills:read` | Read skills and categories | GET /accounts/:id/skills, GET /accounts/:id/categories |
| `knowledge:read` | Read knowledge documents | GET /accounts/:id/knowledge |
| `integrations:read` | List integration definitions | GET /accounts/:id/integrations/definitions |
| `integrations:write` | Trigger syncs | POST /accounts/:id/sync/sources/:sid |
| `account:read` | Read account details and members | GET /accounts/:id, GET /accounts/:id/members |
| `webhooks:read` | List webhooks and deliveries | GET /accounts/:id/webhooks |
| `webhooks:write` | Create, update, delete webhooks | POST/PATCH/DELETE /accounts/:id/webhooks |

**Note**: If no scopes are specified during creation, the key grants full access to all resources.

### Creating API Keys

#### Via Web UI

1. Log in to TaskClaw
2. Navigate to **Settings > API Keys**
3. Click **Create API Key**
4. Enter a descriptive name (e.g., "Claude Code MCP", "CI/CD Pipeline")
5. Select scopes (check all for full access)
6. Click **Create**
7. **Copy the key immediately** — it's only shown once

#### Via API

**Endpoint**: `POST /accounts/:id/api-keys`

**Request:**
```bash
curl -X POST http://localhost:3003/accounts/550e8400-e29b-41d4-a716-446655440000/api-keys \
  -H "Authorization: Bearer <your-jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "CI/CD Pipeline",
    "scopes": ["tasks:read", "tasks:write"],
    "expires_at": "2025-12-31T23:59:59Z"
  }'
```

**Response:**
```json
{
  "id": "key-123",
  "key": "tc_live_abcdef1234567890abcdef1234567890",
  "name": "CI/CD Pipeline",
  "key_prefix": "tc_live_abcd",
  "scopes": ["tasks:read", "tasks:write"],
  "expires_at": "2025-12-31T23:59:59Z",
  "created_at": "2025-01-15T10:00:00Z"
}
```

**IMPORTANT**: The full `key` field is only returned once. Store it securely.

### Using API Keys

API keys can be sent in two ways:

#### Option 1: Authorization Header (Recommended)

```bash
curl http://localhost:3003/accounts/550e8400-e29b-41d4-a716-446655440000/boards \
  -H "Authorization: Bearer tc_live_abcdef1234567890abcdef1234567890"
```

#### Option 2: X-API-Key Header

```bash
curl http://localhost:3003/accounts/550e8400-e29b-41d4-a716-446655440000/boards \
  -H "X-API-Key: tc_live_abcdef1234567890abcdef1234567890"
```

**Example: Create a task**

```bash
curl -X POST http://localhost:3003/accounts/550e8400-e29b-41d4-a716-446655440000/tasks \
  -H "Authorization: Bearer tc_live_abcdef1234567890abcdef1234567890" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Fix authentication bug",
    "board_id": "board-123",
    "step_id": "step-456",
    "priority": "high"
  }'
```

### Listing API Keys

**Endpoint**: `GET /accounts/:id/api-keys`

Returns masked keys (shows prefix only, never the full key):

```bash
curl http://localhost:3003/accounts/550e8400-e29b-41d4-a716-446655440000/api-keys \
  -H "Authorization: Bearer <your-jwt>"
```

**Response:**
```json
{
  "keys": [
    {
      "id": "key-123",
      "name": "CI/CD Pipeline",
      "key_prefix": "tc_live_abcd",
      "scopes": ["tasks:read", "tasks:write"],
      "last_used_at": "2025-01-15T09:30:00Z",
      "expires_at": "2025-12-31T23:59:59Z",
      "created_at": "2025-01-15T10:00:00Z"
    }
  ]
}
```

### Revoking API Keys

**Endpoint**: `DELETE /accounts/:id/api-keys/:keyId`

```bash
curl -X DELETE http://localhost:3003/accounts/550e8400-e29b-41d4-a716-446655440000/api-keys/key-123 \
  -H "Authorization: Bearer <your-jwt>"
```

**Response:**
```json
{
  "success": true,
  "message": "API key revoked successfully"
}
```

Once revoked, the key immediately stops working. All requests using that key will return `401 Unauthorized`.

### Security Best Practices

#### 1. Store Keys Securely

❌ **Bad**: Commit keys to version control
```bash
# .env (committed to Git)
API_KEY=tc_live_abcdef1234567890abcdef1234567890
```

✅ **Good**: Use environment variables, never commit
```bash
# .env.local (in .gitignore)
API_KEY=tc_live_abcdef1234567890abcdef1234567890
```

#### 2. Use Scoped Keys

❌ **Bad**: Full access for all keys
```json
{
  "name": "Test Key",
  "scopes": []  // Full access
}
```

✅ **Good**: Minimal scopes needed
```json
{
  "name": "CI Task Creator",
  "scopes": ["tasks:write"]  // Only what's needed
}
```

#### 3. Set Expiration Dates

✅ **Good**: Keys expire automatically
```json
{
  "name": "Temp Integration",
  "expires_at": "2025-03-01T00:00:00Z"
}
```

#### 4. Rotate Keys Regularly

1. Create a new key
2. Update services to use the new key
3. Revoke the old key
4. Repeat every 90 days (recommended)

#### 5. Monitor Last Used Timestamp

Check `last_used_at` to detect:
- Unused keys (candidates for revocation)
- Suspicious activity (unexpected usage times)

### API Key vs JWT Comparison

| Feature | JWT (Session Tokens) | API Keys |
|---------|---------------------|----------|
| **Expiry** | 1 hour (auto-refresh) | Optional (can be permanent) |
| **Use Case** | User sessions, web UI | Agents, CI/CD, integrations |
| **Scopes** | Based on user role | Explicitly defined scopes |
| **Revocation** | Logout or token blacklist | Instant revocation via API |
| **Storage** | HttpOnly cookies | Environment variables |
| **Rotation** | Automatic (refresh token) | Manual (create new, revoke old) |

**Recommendation**: Use JWT for user-facing applications, API keys for programmatic access.

### Troubleshooting

#### Error: "Invalid API key"

**Causes**:
- Key was revoked
- Key has expired
- Key prefix is incorrect (must start with `tc_live_`)

**Solution**: Verify the key in Settings > API Keys, create a new one if revoked.

#### Error: "Insufficient permissions"

**Cause**: API key scopes don't include the required permission.

**Solution**: Create a new key with the necessary scopes, or use a key with broader permissions.

#### Error: "API key not found"

**Cause**: Using a key that doesn't exist or was deleted.

**Solution**: Create a new key and update your application config.

---

## Extension Guide

### Adding OAuth Providers (Google, GitHub, etc.)

1. **Enable provider in Supabase Dashboard**:
   - Go to Authentication > Providers
   - Enable Google/GitHub
   - Add OAuth credentials

2. **Add OAuth button to login page**:
```typescript
// Frontend
export default function LoginPage() {
  async function handleOAuthLogin(provider: 'google' | 'github') {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  }

  return (
    <>
      <Button onClick={() => handleOAuthLogin('google')}>
        Sign in with Google
      </Button>
      <Button onClick={() => handleOAuthLogin('github')}>
        Sign in with GitHub
      </Button>
    </>
  );
}
```

3. **Handle OAuth callback**:
```typescript
// frontend/src/app/auth/callback/route.ts
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  if (code) {
    // Exchange code for session
    const response = await fetch(`${API_URL}/auth/exchange-code`, {
      method: 'POST',
      body: JSON.stringify({ code }),
    });

    const session = await response.json();
    cookies().set('access_token', session.access_token);
    
    redirect('/dashboard');
  }
}
```

### Adding Custom User Roles

1. **Add role to enum**:
```typescript
// backend/src/users/user.enums.ts
export enum UserRole {
  SUPER_ADMIN = 'super_admin',
  ADMIN = 'admin',
  MODERATOR = 'moderator',  // New role
  USER = 'user',
}
```

2. **Create custom guard**:
```typescript
// backend/src/common/guards/moderator.guard.ts
@Injectable()
export class ModeratorGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const role = user.app_metadata?.role;

    if (!['super_admin', 'moderator'].includes(role)) {
      throw new ForbiddenException('Requires moderator access');
    }

    return true;
  }
}
```

3. **Use guard on endpoints**:
```typescript
@Controller('moderation')
@UseGuards(AuthGuard, ModeratorGuard)
export class ModerationController {
  // Moderator-only endpoints
}
```

### Adding Two-Factor Authentication (2FA)

1. **Enable MFA in Supabase Dashboard**:
   - Authentication > Settings > Enable MFA

2. **Add MFA enrollment endpoint**:
```typescript
// Backend
@UseGuards(AuthGuard)
@Post('auth/mfa/enroll')
async enrollMFA(@Req() req: any) {
  const supabase = this.supabaseService.getAuthClient(req.token);
  
  const { data } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
  });

  return {
    qrCode: data.totp.qr_code,
    secret: data.totp.secret,
  };
}
```

3. **Add MFA verification**:
```typescript
@Post('auth/mfa/verify')
async verifyMFA(@Body() dto: VerifyMFADto, @Req() req: any) {
  const supabase = this.supabaseService.getAuthClient(req.token);
  
  const { data } = await supabase.auth.mfa.challengeAndVerify({
    factorId: dto.factorId,
    code: dto.code,
  });

  return data;
}
```

---

## Troubleshooting & FAQ

### Common Errors

#### Error: "Invalid JWT" or "JWT expired"

**Cause**: Token has expired (default: 1 hour) or is malformed.

**Solution:**
1. Implement token refresh logic:
```typescript
async function refreshSession() {
  const refreshToken = cookies().get('refresh_token');
  
  const response = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    body: JSON.stringify({ refreshToken }),
  });

  const newSession = await response.json();
  cookies().set('access_token', newSession.access_token);
}
```

2. Use Supabase client auto-refresh:
```typescript
const supabase = createClient(url, key, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
  },
});
```

#### Error: "Your account is pending approval"

**Cause**: User status is 'pending' (not yet approved by admin).

**Solution:**
1. Admin approves user in admin panel (`/admin/users`)
2. Or via SQL:
```sql
UPDATE users SET status = 'active' WHERE email = 'user@example.com';
```

#### Error: "AuthGuard Error: Column 'status' does not exist"

**Cause**: User status migration not applied.

**Solution:**
```bash
cd backend
npx supabase migration up
```

Or manually add column:
```sql
ALTER TABLE users ADD COLUMN status text 
  CHECK (status IN ('active', 'pending', 'suspended')) 
  DEFAULT 'active';
```

#### Error: "Supabase client not initialized"

**Cause**: Environment variables not set.

**Solution:**
1. Check `.env` files exist (not `.env.example`)
2. Verify variables are set:
```bash
echo $SUPABASE_URL
echo $SUPABASE_KEY
```
3. Restart dev server after changing `.env`

### FAQs

**Q: How do I change the default user status from 'pending' to 'active'?**

A: Modify the signup logic in `backend/src/auth/auth.service.ts`:
```typescript
await admin.from('users').upsert({
  id: data.user.id,
  status: 'active',  // Changed from 'pending'
});
```

**Q: Can I use social logins (Google, GitHub) with the approval workflow?**

A: Yes. The status check happens regardless of login method. OAuth users will also be created with `status: 'pending'`.

**Q: How do I customize the JWT payload?**

A: Supabase JWT claims are managed in the Supabase Dashboard under Authentication > Settings > JWT Settings. You can add custom claims via database triggers or Supabase Edge Functions.

**Q: What's the difference between `getClient()` and `getAdminClient()`?**

A:
- `getClient(token)` - Uses user's JWT, respects RLS policies
- `getAdminClient()` - Uses service role key, bypasses RLS (admin operations only)

**Q: How do I implement "Remember Me" functionality?**

A: Supabase handles this automatically. Refresh tokens are long-lived (default: 30 days). To customize:
```typescript
const { data } = await supabase.auth.signInWithPassword({
  email,
  password,
  options: {
    persistSession: true,  // Persists refresh token
  },
});
```

**Q: Can I have different role hierarchies per account?**

A: Yes! The `account_users` table has a `role` column (owner/admin/member) that's account-specific. Users can have different roles in different accounts.

---

## Related Documentation

- [Multi-Tenancy](./multi-tenancy.md) - Account and project-level permissions
- [User Management](./user-management.md) - User profiles, invitations, and admin management
- [Database Architecture](./database-architecture.md) - RLS policies and database functions
- [Backend Architecture](./backend-architecture.md) - Guards, middleware, and service patterns
- [Super Admin Panel](./super-admin-panel.md) - Admin dashboard and user management

### External Resources

- [Supabase Auth Documentation](https://supabase.com/docs/guides/auth)
- [NestJS Guards](https://docs.nestjs.com/guards)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
