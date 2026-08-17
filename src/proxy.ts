import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "@/lib/env";

/**
 * Refreshes the Supabase session and keeps signed-out visitors off the coach
 * routes.
 *
 * Named `proxy`, not `middleware`: Next 16 deprecated and renamed that file
 * convention (see node_modules/next/dist/docs → app/api-reference/file-conventions/proxy).
 *
 * The redirect here is convenience, not security. The real boundary is RLS in
 * the database plus `requireCoach()` in each route; this only avoids rendering
 * a shell that would come back empty.
 */

const PUBLIC_PREFIXES = ["/login", "/signup", "/auth", "/api/health"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { pathname } = request.nextUrl;

  const { url, key } = getSupabaseConfig();

  // Without credentials there is no session to refresh. Send everything except
  // the public routes to /login, which renders a setup message explaining
  // exactly what is missing rather than looking mysteriously empty.
  if (!url || !key) {
    if (isPublic(pathname)) return response;
    const target = request.nextUrl.clone();
    target.pathname = "/login";
    target.search = "";
    return NextResponse.redirect(target);
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Revalidates the token and rotates cookies when needed. Must run before any
  // redirect decision, or a valid-but-stale session reads as signed out.
  let signedIn = false;
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    signedIn = Boolean(user);
  } catch {
    // Auth service unreachable. Treat as signed out rather than 500 — /login
    // and /api/health stay available so the cause is diagnosable.
    signedIn = false;
  }

  if (!signedIn && !isPublic(pathname)) {
    const target = request.nextUrl.clone();
    target.pathname = "/login";
    target.search = "";
    // Send them back where they were headed once signed in.
    if (pathname !== "/") target.searchParams.set("next", pathname);
    return NextResponse.redirect(target);
  }

  if (signedIn && (pathname === "/login" || pathname === "/signup")) {
    const target = request.nextUrl.clone();
    target.pathname = "/programs";
    target.search = "";
    return NextResponse.redirect(target);
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except static assets and the icon.
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
