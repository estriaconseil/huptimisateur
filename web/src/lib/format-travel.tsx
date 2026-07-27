import { cn } from "@/lib/utils";

/** Seuils d'affichage : &lt;20 vert, 20–40 jaune, &gt;40 rouge. */
export function travelMinutesFromSeconds(seconds: number | null | undefined): number | null {
  if (seconds == null) return null;
  return Math.round(seconds / 60);
}

export function travelDurationColorClass(minutes: number | null | undefined): string {
  if (minutes == null) return "text-muted-foreground";
  if (minutes < 20) return "text-emerald-600";
  if (minutes <= 40) return "text-amber-500";
  return "text-red-600";
}

export function formatTravelDurationLabel(seconds: number | null | undefined): string {
  const minutes = travelMinutesFromSeconds(seconds);
  if (minutes == null) return "—";
  return `${minutes} min`;
}

type TravelDurationProps = {
  seconds: number | null | undefined;
  className?: string;
  /** Classes appliquées uniquement au chiffre coloré */
  numberClassName?: string;
  /** Désactive le code couleur — affiche en muted (ex: journée complète) */
  neutral?: boolean;
};

/** Affiche « N min » coloré selon les seuils (&lt;20 vert, 20–40 jaune, &gt;40 rouge). */
export function TravelDuration({ seconds, className, numberClassName, neutral }: TravelDurationProps) {
  const minutes = travelMinutesFromSeconds(seconds ?? null);
  if (minutes == null) {
    return <span className={cn("text-muted-foreground", className)}>—</span>;
  }
  const colorClass = neutral ? "text-muted-foreground" : travelDurationColorClass(minutes);
  return (
    <span className={cn(colorClass, className, numberClassName)}>
      {minutes} min
    </span>
  );
}
