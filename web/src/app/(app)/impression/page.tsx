import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ImpressionPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Impression</h1>
        <p className="text-muted-foreground text-sm">
          Fiches de route par équipe et par jour — 1 job par page ou 2 jobs par page (priorité 2).
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Pages imprimables</CardTitle>
          <CardDescription>HTML dédié avec styles @media print.</CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          Contenu : équipe, date, AM/PM, client, coordonnées, adresse, installation, notes internes.
        </CardContent>
      </Card>
    </div>
  );
}
