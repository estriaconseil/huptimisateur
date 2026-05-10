import type { ScheduleSlot, ScheduleSuggestion } from "@/types/domain";

export type SuggestionInput = {
  /** Jobs déjà planifiées : teamId -> date ISO -> slot -> { lat, lng } du lieu */
  existingByTeamDate: Map<
    string,
    Map<string, { am?: { lat: number; lng: number }; pm?: { lat: number; lng: number } }>
  >;
  office: { lat: number; lng: number };
  jobDestination: { lat: number; lng: number };
  candidateSlots: Array<{
    teamId: string;
    teamName: string;
    date: string;
    slot: ScheduleSlot;
  }>;
};

/**
 * Trie les candidats par distance routière approximative.
 * L’implémentation Google (Routes / Distance Matrix) sera branchée ici (PRIORITÉ 2).
 */
export async function rankSuggestionsByDistance(
  _input: SuggestionInput
): Promise<ScheduleSuggestion[]> {
  void _input;
  return [];
}
