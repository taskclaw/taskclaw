import 'reflect-metadata';

import * as fs from 'fs';
import * as path from 'path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const EMAIL = 'super@taskclaw.co';
const PASSWORD = 'admin123456';
const ROLE = 'super_admin';

function loadDotEnvIfPresent() {
    // Load backend/.env when running locally via ts-node (best-effort).
    const envPath = path.resolve(process.cwd(), '.env');
    if (!fs.existsSync(envPath)) return;

    const content = fs.readFileSync(envPath, 'utf8');
    for (const rawLine of content.split('\n')) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;

        const eq = line.indexOf('=');
        if (eq === -1) continue;

        const key = line.slice(0, eq).trim();
        let val = line.slice(eq + 1).trim();

        // Strip wrapping quotes: FOO="bar" or FOO='bar'
        if (
            (val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
            (val.startsWith("'") && val.endsWith("'") && val.length >= 2)
        ) {
            val = val.slice(1, -1);
        }

        if (process.env[key] === undefined) {
            process.env[key] = val;
        }
    }
}

function requiredEnv(name: string): string {
    const val = process.env[name];
    if (!val) {
        throw new Error(`Missing required env var: ${name}`);
    }
    return val;
}

async function findUserIdByEmail(supabase: SupabaseClient<any>, email: string): Promise<string | null> {
    // Supabase Admin API doesn't provide a direct get-by-email call; list + scan is fine for dev.
    const perPage = 200;
    for (let page = 1; page <= 20; page++) {
        const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
        if (error) throw error;

        const match = data.users.find((u) => (u.email || '').toLowerCase() === email.toLowerCase());
        if (match?.id) return match.id;

        // Heuristic: if we got fewer than perPage, we're done paging.
        if (data.users.length < perPage) break;
    }

    return null;
}

async function main() {
    loadDotEnvIfPresent();

    const url = requiredEnv('SUPABASE_URL');
    const serviceKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');

    const supabase = createClient(url, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });

    const existingUserId = await findUserIdByEmail(supabase, EMAIL);

    if (!existingUserId) {
        const { data, error } = await supabase.auth.admin.createUser({
            email: EMAIL,
            password: PASSWORD,
            email_confirm: true,
            app_metadata: { role: ROLE },
        });
        if (error) throw error;

        console.log(`Created user ${EMAIL} (${data.user?.id}) with role=${ROLE}`);
        return;
    }

    const { data: existing, error: getErr } = await supabase.auth.admin.getUserById(existingUserId);
    if (getErr) throw getErr;

    const currentAppMeta = (existing.user?.app_metadata ?? {}) as Record<string, unknown>;

    const { error: updateErr } = await supabase.auth.admin.updateUserById(existingUserId, {
        password: PASSWORD,
        app_metadata: {
            ...currentAppMeta,
            role: ROLE,
        },
    });
    if (updateErr) throw updateErr;

    console.log(`Updated user ${EMAIL} (${existingUserId}) to role=${ROLE} (password set).`);
}

main().catch((err) => {
    // Keep output readable in CI/terminal.
    console.error(err?.message ?? err);
    process.exit(1);
});

