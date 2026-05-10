import { redirect } from "next/navigation";

import { LoginForm } from "@/features/auth/login-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function LoginPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dispatch");
  }

  return (
    <Card className="border-border w-full max-w-md shadow-sm">
      <CardHeader className="space-y-1">
        <CardTitle className="text-xl">Connexion</CardTitle>
        <CardDescription>Dispatch terrain — compte Supabase Auth</CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm />
      </CardContent>
    </Card>
  );
}
