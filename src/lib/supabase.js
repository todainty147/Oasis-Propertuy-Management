import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.VITE_SUPABASE_PROJECT_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  const missing = [
    !supabaseUrl ? "VITE_SUPABASE_URL" : null,
    !supabaseAnonKey ? "VITE_SUPABASE_ANON_KEY" : null,
  ]
    .filter(Boolean)
    .join(", ");

  throw new Error(
    `Missing Supabase environment variables: ${missing}. Copy .env.example to .env and set the required values.`,
  );
}

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);
