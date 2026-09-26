import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PREFIXES = ["/app"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser() (not getSession()) — it revalidates the JWT with Supabase
  // rather than trusting a cookie the browser could have tampered with.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  if (isProtected && !user) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  // Deliberately no "user with a valid JWT on /login or /signup -> bounce to
  // /app" rule here. It used to exist as a UX shortcut, but it's redundant —
  // `signIn`/`signUp` already `redirect("/app")` themselves on success — and
  // it produces a genuine redirect loop for a real, reachable state: a
  // Supabase auth session can exist (e.g. right after signUp()'s own
  // session-issuing behavior) before `edospmis_memberships` has an active
  // row for that user. In that window, `getSession()` (lib/data/session.ts)
  // correctly treats them as not-yet-provisioned and sends them to /login,
  // while this rule — checking only "is there a JWT", nothing deeper — sent
  // them straight back to /app, which sent them to /login again: an infinite
  // ERR_TOO_MANY_REDIRECTS. Landing on /login and re-submitting the form is
  // harmless (and actually re-runs the pending-tenant provisioning fallback
  // in signIn's own action); looping forever is not.
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|images/|icons/|manifest.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?)$).*)",
  ],
};
