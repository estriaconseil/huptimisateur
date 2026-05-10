import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function NouveauClientJobPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Nouveau client / nouvelle job</h1>
        <p className="text-muted-foreground text-sm">
          Formulaire client + adresse Google + job. Prochaine étape : React Hook Form, enregistrement Supabase,
          bouton « Créer et suggérer une planification ».
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Placeholder</CardTitle>
          <CardDescription>Schéma Zod prêt dans lib/validations/client-job.ts</CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          Autocomplete Places et suggestions distance seront branchés en priorité 2.
        </CardContent>
      </Card>
    </div>
  );
}
