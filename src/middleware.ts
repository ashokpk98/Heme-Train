import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/signup", "/auth"];

/**
 * Refreshes the Supabase session on every request and guards the coach routes.
 *
 * The redirect here is convenience, not security — the real boundary is RLS in
 * the database plus `requireCoach()` in each page. Middleware only avoids
 * rendering a shell that would come back empty.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Without credentials there is no session to refresh; let the page render and
  // surface a clear configuration error rather than redirect-looping.
  if (!url || !anonKey) return response;

  const supabase = createServerClient(url, anonKey, {
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
  // redirect decision, or a valid-but-stale session would be treated as signed
  // out.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  if (!user && !isPublic) {
    const target = request.nextUrl.clone();
    target.pathname = "/login";
    // Send them back where they were headed once signed in.
    target.searchParams.set("next", pathname);
    return NextResponse.redirect(target);
  }

  if (user && (pathname === "/login" || pathname === "/signup")) {
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
