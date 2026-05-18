"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { saveAppSettings } from "@/actions/settings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AppSettings, UserRole } from "@/types/domain";

type Props = {
  settings: AppSettings | null;
  role: UserRole;
};

export function SettingsForm({ settings, role }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isAdmin = role === "admin";

  /* Champs contrôlés */
  const [officeAddress, setOfficeAddress] = useState(settings?.office_address ?? "");
  const [officeLat, setOfficeLat] = useState<number | null>(settings?.office_lat ?? null);
  const [officeLng, setOfficeLng] = useState<number | null>(settings?.office_lng ?? null);
  const [amStart, setAmStart] = useState(settings?.am_start ?? "08:00");
  const [amEnd, setAmEnd] = useState(settings?.am_end ?? "12:00");
  const [pmStart, setPmStart] = useState(settings?.pm_start ?? "13:00");
  const [pmEnd, setPmEnd] = useState(settings?.pm_end ?? "17:00");
  const [threshold, setThreshold] = useState(
    String(settings?.full_day_threshold_hours ?? 8)
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const thresholdNum = Number(threshold);
    if (isNaN(thresholdNum) || thresholdNum < 1 || thresholdNum > 24) {
      setError("Le seuil doit être entre 1 et 24 heures.");
      return;
    }

    startTransition(async () => {
      const res = await saveAppSettings({
        office_address: officeAddress,
        office_lat: officeLat,
        office_lng: officeLng,
        am_start: amStart,
        am_end: amEnd,
        pm_start: pmStart,
        pm_end: pmEnd,
        full_day_threshold_hours: thresholdNum,
      });

      if (!res.ok) {
        setError(res.message);
        return;
      }

      setSuccess(true);
      router.refresh();
    });
  }

  async function resolveGps() {
    if (!officeAddress.trim()) return;
    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
          officeAddress
        )}&key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}`
      );
      const data = (await res.json()) as {
        status: string;
        results: { geometry: { location: { lat: number; lng: number } } }[];
      };
      if (data.status === "OK" && data.results[0]) {
        const { lat, lng } = data.results[0].geometry.location;
        setOfficeLat(lat);
        setOfficeLng(lng);
      } else {
        setError("Adresse introuvable. Vérifie le format ou utilise une adresse Google Maps exacte.");
      }
    } catch {
      setError("Erreur lors de la résolution GPS. Vérifie ta connexion.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {!isAdmin && (
        <p className="bg-muted text-muted-foreground rounded-lg border px-4 py-3 text-sm">
          Lecture seule. Seul un administrateur peut modifier les paramètres.
        </p>
      )}

      {/* Adresse du bureau */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Adresse du bureau</CardTitle>
          <CardDescription>
            Point de départ utilisé pour le calcul des suggestions de distance.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="office-address">Adresse complète</Label>
            <Input
              id="office-address"
              value={officeAddress}
              onChange={(e) => setOfficeAddress(e.target.value)}
              placeholder="123 rue Principale, Sherbrooke, QC"
              disabled={!isAdmin}
            />
          </div>

          {officeLat && officeLng && (
            <p className="text-muted-foreground text-xs">
              Coordonnées GPS : {officeLat.toFixed(5)}, {officeLng.toFixed(5)}
            </p>
          )}

          {isAdmin && (
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending || !officeAddress.trim()}
                onClick={resolveGps}
              >
                Résoudre les coordonnées GPS
              </Button>
              <p className="text-muted-foreground text-xs">
                Clique après avoir entré l&apos;adresse pour enregistrer les coordonnées GPS.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Horaires */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Horaires AM / PM</CardTitle>
          <CardDescription>
            Plages horaires affichées sur les fiches de route imprimées.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-3">
              <p className="text-sm font-medium">Matin (AM)</p>
              <div className="space-y-1.5">
                <Label htmlFor="am-start">Début</Label>
                <Input
                  id="am-start"
                  type="time"
                  value={amStart}
                  onChange={(e) => setAmStart(e.target.value)}
                  disabled={!isAdmin}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="am-end">Fin</Label>
                <Input
                  id="am-end"
                  type="time"
                  value={amEnd}
                  onChange={(e) => setAmEnd(e.target.value)}
                  disabled={!isAdmin}
                />
              </div>
            </div>
            <div className="space-y-3">
              <p className="text-sm font-medium">Après-midi (PM)</p>
              <div className="space-y-1.5">
                <Label htmlFor="pm-start">Début</Label>
                <Input
                  id="pm-start"
                  type="time"
                  value={pmStart}
                  onChange={(e) => setPmStart(e.target.value)}
                  disabled={!isAdmin}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pm-end">Fin</Label>
                <Input
                  id="pm-end"
                  type="time"
                  value={pmEnd}
                  onChange={(e) => setPmEnd(e.target.value)}
                  disabled={!isAdmin}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Seuil journée complète */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Seuil journée complète</CardTitle>
          <CardDescription>
            Une job dont la durée estimée atteint ce seuil bloque les deux slots AM et PM.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1.5">
          <Label htmlFor="threshold">Durée seuil (heures)</Label>
          <div className="flex items-center gap-3">
            <Input
              id="threshold"
              type="number"
              min={1}
              max={24}
              step={1}
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              disabled={!isAdmin}
              className="w-24"
            />
            <span className="text-muted-foreground text-sm">heures (recommandé : 6)</span>
          </div>
        </CardContent>
      </Card>

      {isAdmin && (
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Enregistrement..." : "Enregistrer les paramètres"}
          </Button>
          {success && (
            <p className="text-sm text-green-600 dark:text-green-400">
              Paramètres enregistrés.
            </p>
          )}
          {error && (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </form>
  );
}
