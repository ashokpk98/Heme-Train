import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/auth/server";

/**
 * Exchanges the one-time code from an email confirmation or OAuth redirect for
 * a session cookie.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next");

  // Same-origin relative paths only.
  const destination =
    next && next.startsWith("/") && !next.startsWith("//") ? next : "/programs";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=invalid_code`);
  }

  return NextResponse.redirect(`${origin}${destination}`);
}
