"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import type { Team } from "@/types/domain";

type Props = {
  teams: Team[];
  currentDate?: string;
  currentTeam?: string;
  currentMode?: string;
};

export function PrintSelector({ teams, currentDate, currentTeam, currentMode }: Props) {
  const router = useRouter();
  const [date, setDate] = useState(currentDate ?? "");
  const [teamId, setTeamId] = useState(currentTeam ?? "");
  const [mode, setMode] = useState(currentMode ?? "1");

  function apply() {
    if (!date || !teamId) return;
    const params = new URLSearchParams({ date, team: teamId, mode });
    router.push(`/impression?${params.toString()}`);
  }

  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex flex-wrap items-end gap-4">
          {/* Date */}
          <div className="space-y-1.5">
            <Label htmlFor="print-date">Date</Label>
            <input
              id="print-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
            />
          </div>

          {/* Équipe */}
          <div className="space-y-1.5">
            <Label htmlFor="print-team">Équipe</Label>
            <select
              id="print-team"
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <option value="">— Choisir —</option>
              <option value="all">Toutes les équipes</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          {/* Mode */}
          <div className="space-y-1.5">
            <Label htmlFor="print-mode">Mise en page</Label>
            <select
              id="print-mode"
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <option value="1">1 job par page</option>
              <option value="2">2 jobs par page</option>
            </select>
          </div>

          <Button
            type="button"
            size="sm"
            disabled={!date || !teamId}
            onClick={apply}
          >
            Afficher les fiches
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
