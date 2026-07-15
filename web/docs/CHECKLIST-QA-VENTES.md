# Checklist QA — Ventes / Soumissions

Coche chaque case au fur et à mesure (`[x]`).  
Prérequis : migrations `20260705*`, `20260712100000`, `20260712120000` appliquées ; ≥ 2 vendeurs avec domicile GPS + créneaux actifs ; prospects avec adresse GPS.

---

## 1. Navigation

- [ ] `/dashboard` redirige vers `/dispatch`
- [ ] Sidebar Ventes : Pipeline → Calendrier → Soumissions
- [ ] Sidebar Installations : Jobs à placer → Calendrier → Nouveau

---

## 2. Happy path (statuts)

- [ ] **A** Créer un prospect → statut **Prospect**
- [ ] **B** Pipeline → **Trouver un créneau** → booker → **Visite planifiée** + RDV visible au calendrier
- [ ] **C** Ouvrir soumission, 1 unité avec total > 0, sauvegarder → **En attente**
- [ ] **D** **Répartir** (durée 4 h ou 8 h + choix RDV) → job **À planifier** dans Jobs à placer

### Négatifs

- [ ] Passer manuellement en **Visite planifiée** sans RDV → erreur / bloqué (« Trouver un créneau »)
- [ ] Sauvegarder soumission avec sous-total = 0 → ne passe **pas** En attente
- [ ] Répartir sans durée 4/8 h → erreur

---

## 3. RDV (annulation, remplacement, re-opti)

- [ ] **Annuler RDV** (calendrier ventes) → job revient **Prospect** ; créneau libre
- [ ] **Re-booker** un dossier déjà booké → un seul RDV actif (ancien remplacé)
- [ ] **Re-opti** (« Trouver un créneau » sur visite déjà planifiée) → le créneau actuel n’est pas bloqué par lui-même
- [ ] **Répartir + Annuler le RDV** → créneau libre au calendrier ventes

---

## 4. Optimiseur (Ventes seulement)

Affichage attendu : `X min` (ex. `42 min`) — pas de km, pas de `1h30`.

- [ ] Premier créneau du jour (pas de RDV avant) → score depuis domicile vendeur
- [ ] Créneau entre 2 RDV → score ≈ moyenne prev/next
- [ ] Dernier créneau (prev seulement) → score depuis prev
- [ ] Prospect sans GPS → pas de crash ; score manquant / en bas de liste
- [ ] Vendeur déjà assigné → résultats filtrés sur ce vendeur
- [ ] Grille semaine et top créneaux affichent les mêmes minutes (cohérent)

---

## 5. Drapeaux de suivi

- [ ] Changer **À suivre** / **À relancer** / **RDV passé** sans changer le statut principal
- [ ] Filtrer le pipeline par drapeau
- [ ] Visite planifiée dont la date est passée + flag vide → au reload pipeline, auto **RDV passé**
- [ ] Booker ou répartir → drapeau remis à vide

---

## 6. Formulaire soumission

### Écran

- [ ] Onglets Unité 1 / 2 / 3 : une unité visible à la fois ; pastille si marque/modèle rempli
- [ ] Support + Au sol **par unité**
- [ ] Niveau d’installation + Techniciens **une fois** (Autres détails)
- [ ] Ligne unité : **Total unité** (label bleu plus grand) à gauche, **# Série** à droite
- [ ] Montants au format canadien : `123.45 $` (symbole à la fin) — unité + récap
- [ ] Sous-total se recalcule depuis les totaux d’unités
- [ ] Ligne **TOTAL** plus lisible (texte plus grand)

### Impression

- [ ] Sidebar / boutons / onglets masqués
- [ ] Unités remplies empilées avec titres Unité 1, 2, 3
- [ ] Unités vides absentes
- [ ] Pas de coupure bizarre au milieu d’un bloc équipement

### Répartir depuis soumission

- [ ] Durée obligatoire (4 h / 8 h)
- [ ] Choix garder vs annuler RDV ventes
- [ ] Après succès → job dans `/a-planifier`

---

## 7. Jobs à placer

- [ ] Label durée : « Demi-journée (4 h) » ou « Journée (8 h) »
- [ ] Téléphone visible
- [ ] Adresse visible
- [ ] **Ouvrir soumission** → `/ventes/soumission/[jobId]`
- [ ] Placement calendrier installations (AM/PM vs journée selon durée)

---

## 8. Liste soumissions + liens

- [ ] `/ventes/soumissions` liste les soumissions
- [ ] Ouverture depuis pipeline, RDV, ou job fonctionne
- [ ] Modifier soumission (unités, série, montants) → persiste après refresh

---

## 9. Smoke / régressions

- [ ] Dispatch installations utilisable
- [ ] Nouveau client / job installation hors ventes (`/nouveau`)
- [ ] Pas d’erreur console sur pipeline / calendrier ventes / soumission

---

## Verdict

- [ ] **GO** — tous les critères critiques OK (flux, RDV libéré, minutes, impression, `$`, durée 4/8)
- [ ] **NO-GO** — noter les échecs ici :

```
Échec :
Étape :
Attendu :
Obtenu :
```
