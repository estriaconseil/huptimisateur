import { NewClientJobForm } from "@/features/jobs/new-client-job-form";

export default async function NouveauClientJobPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>;
}) {
  const { created } = await searchParams;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Nouveau client / nouvelle job</h1>
        <p className="text-muted-foreground text-sm">
          Client, adresse (Google Places), puis détails de la job. Les deux boutons enregistrent en base ;
          le second ouvre le dispatch pour choisir un créneau (suggestions à venir).
        </p>
      </div>

      {created ? (
        <p className="bg-muted text-muted-foreground rounded-lg border px-4 py-3 text-sm">
          Job enregistrée. Tu peux en créer une autre ou passer au calendrier pour la planifier.
        </p>
      ) : null}

      <NewClientJobForm />
    </div>
  );
}
