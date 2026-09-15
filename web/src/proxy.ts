import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Routes accessibles aux vendeurs (rôle `salesperson`).
 * Toute autre route de l'app redirige vers /ventes.
 * Doit rester synchronisé avec (app)/layout.tsx.
 */
const SALESPERSON_ALLOWED: string[] = [
  "/ventes",   // calendrier + sous-routes (/pipeline, /soumissions, /rdv/…)
  "/clients",  // base clients (filtrée côté serveur)
  "/nouveau",  // création prospect / client
];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Injecter le pathname dans les headers pour que le layout puisse le lire
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);

  let response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) return response;

  try {
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request: { headers: requestHeaders } });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    });

    // Refresh session Supabase SSR (obligatoire)
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Non connecté → le layout redirige vers /login
    if (!user) return response;

    // ── Restriction par rôle ──────────────────────────────────────────────
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.role === "salesperson") {
      const allowed = SALESPERSON_ALLOWED.some(
        (prefix) =>
          pathname === prefix || pathname.startsWith(`${prefix}/`)
      );

      if (!allowed) {
        return NextResponse.redirect(new URL("/ventes", request.url));
      }
    }
  } catch {
    // Erreur Supabase dans le proxy → laisser passer.
    // Le layout (app)/layout.tsx prend le relai avec sa propre vérification.
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)",
  ],
};
