import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseConfig, isAuthConfigured } from "@/lib/env";

export { isAuthConfigured };

/**
 * Supabase client for server components, route handlers and server actions.
 *
 * Reads and writes the session cookies. Server components cannot set cookies,
 * so the setter is a no-op there — `src/proxy.ts` is what refreshes the session.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, key } = getSupabaseConfig();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a server component: the proxy refreshes instead.
        }
      },
    },
  });
}
