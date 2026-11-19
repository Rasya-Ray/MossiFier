import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

/**
 * Supabase client (browser). Hanya memakai anon/publishable key —
 * aman dipakai di client selama RLS diatur di Supabase.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
