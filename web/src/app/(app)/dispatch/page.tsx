import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function DispatchPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Calendrier / dispatch</h1>
        <p className="text-muted-foreground text-sm">
          Vue semaine par équipe (AM / PM). Prochaine étape : grille interactive et affectation manuelle.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>À venir (priorité 1)</CardTitle>
          <CardDescription>
            Navigation semaine, filtre équipe, états libre / réservé / bloqué / équipe inactive.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          Les données proviendront de Supabase (<code className="text-foreground">teams</code>,{" "}
          <code className="text-foreground">schedules</code>, <code className="text-foreground">jobs</code>).
        </CardContent>
      </Card>
    </div>
  );
}
