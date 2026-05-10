import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ParametresPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Paramètres</h1>
        <p className="text-muted-foreground text-sm">
          Bureau, horaires AM/PM, seuil journée complète (<code className="text-foreground">app_settings</code>
          ).
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>À brancher</CardTitle>
          <CardDescription>Lecture / mise à jour Supabase (admin uniquement pour l’écriture).</CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          Valeurs par défaut : AM 8h–12h, PM 13h–17h, seuil 6 h.
        </CardContent>
      </Card>
    </div>
  );
}
