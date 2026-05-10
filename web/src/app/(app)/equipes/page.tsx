import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function EquipesPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Équipes</h1>
        <p className="text-muted-foreground text-sm">
          Gestion des équipes (nom, actif, couleur, notes). Réservé aux administrateurs côté API ; UI à
          verrouiller selon le rôle.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Seed développement</CardTitle>
          <CardDescription>La migration SQL crée 6 équipes par défaut.</CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          Prochaine étape : liste éditable et bascule actif / inactif.
        </CardContent>
      </Card>
    </div>
  );
}
