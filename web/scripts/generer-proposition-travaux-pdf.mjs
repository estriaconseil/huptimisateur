import React from "react";
import { renderToFile, Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const h = React.createElement;
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "..", "docs", "Proposition-travaux-soumissions-Huppe-v3.pdf");

const brand = "#003B7C";
const muted = "#555555";
const line = "#D0D5DD";
const soft = "#F5F7FA";

const s = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 48,
    paddingHorizontal: 42,
    fontFamily: "Helvetica",
    fontSize: 9.5,
    color: "#1a1a1a",
    lineHeight: 1.4,
  },
  title: { fontSize: 16, fontFamily: "Helvetica-Bold", color: brand, marginBottom: 4 },
  subtitle: { fontSize: 9, color: muted, marginBottom: 16 },
  intro: { marginBottom: 14, fontSize: 10 },
  h2: { fontSize: 12, fontFamily: "Helvetica-Bold", color: brand, marginTop: 14, marginBottom: 6 },
  h3: { fontSize: 10, fontFamily: "Helvetica-Bold", marginTop: 0, marginBottom: 4 },
  p: { marginBottom: 6 },
  note: { fontSize: 9, color: muted, marginBottom: 8 },
  box: { backgroundColor: soft, borderRadius: 4, padding: 10, marginBottom: 10, marginTop: 4 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: line },
  rowHead: { flexDirection: "row", backgroundColor: brand },
  cell: { paddingVertical: 5, paddingHorizontal: 5, fontSize: 8.5 },
  cellHead: {
    paddingVertical: 5,
    paddingHorizontal: 5,
    fontSize: 8.5,
    color: "#fff",
    fontFamily: "Helvetica-Bold",
  },
  c1: { width: "48%" },
  c2: { width: "34%" },
  c3: { width: "18%", textAlign: "right" },
  total: { marginTop: 6, marginBottom: 4, fontFamily: "Helvetica-Bold", fontSize: 10 },
  bullet: { marginBottom: 3 },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 42,
    right: 42,
    fontSize: 8,
    color: muted,
    borderTopWidth: 0.5,
    borderTopColor: line,
    paddingTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
  },
});

function Header({ title }) {
  return h(
    View,
    null,
    h(Text, { style: s.title }, title),
    h(Text, { style: s.subtitle }, "Huppé Réfrigération — Huptimisateur · Proposition de travaux")
  );
}

function Table({ rows }) {
  return h(
    View,
    { style: { marginBottom: 6 } },
    h(
      View,
      { style: s.rowHead },
      h(Text, { style: [s.cellHead, s.c1] }, "Quoi"),
      h(Text, { style: [s.cellHead, s.c2] }, "Pourquoi"),
      h(Text, { style: [s.cellHead, s.c3] }, "Temps")
    ),
    ...rows.map((r, i) =>
      h(
        View,
        { key: String(i), style: [s.row, i % 2 === 1 ? { backgroundColor: soft } : {}] },
        h(Text, { style: [s.cell, s.c1] }, r.quoi),
        h(Text, { style: [s.cell, s.c2] }, r.pourquoi),
        h(Text, { style: [s.cell, s.c3] }, r.temps)
      )
    )
  );
}

function Footer() {
  return h(
    View,
    { style: s.footer, fixed: true },
    h(Text, null, "Proposition travaux soumissions — confidentiel"),
    h(Text, {
      render: ({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`,
    })
  );
}

const urgentRows = [
  {
    quoi: "Corriger le nom du vendeur qui manque parfois sur le PDF (surtout tablette)",
    pourquoi: "Le client doit toujours voir le bon représentant",
    temps: "3–5 h",
  },
  {
    quoi: "Permettre aux directeurs de faire des soumissions avec leur nom, sans apparaître dans le calendrier des RDV optimisés des 2 vendeurs",
    pourquoi: "Aujourd’hui un seul réglage « actif » casse l’un ou l’autre",
    temps: "6–8 h",
  },
  {
    quoi: "Quand on clique Imprimer, utiliser le même PDF que celui envoyé par courriel",
    pourquoi: "Plus d’écart entre l’écran et l’impression",
    temps: "2–3 h",
  },
  {
    quoi: "Mieux indiquer comment ajouter une soumission à un client existant",
    pourquoi: "Moins d’erreurs / doublons",
    temps: "1–3 h",
  },
];

const aFaireRows = [
  {
    quoi: "Pouvoir écrire un message au client avant d’envoyer la soumission, et faire en sorte que les réponses reviennent au bon vendeur (pas toutes à Natasha)",
    pourquoi: "Première amélioration du courriel",
    temps: "4–5 h",
  },
  {
    quoi: "Pouvoir offrir jusqu’à 5 options (A à E), pas seulement A et B",
    pourquoi: "Demandé par les vendeurs",
    temps: "14–20 h",
  },
  {
    quoi: "Pouvoir enlever un « Accepté » si le client change d’avis",
    pourquoi: "Cas rare, mais utile",
    temps: "4–6 h",
  },
  {
    quoi: "Historique des changements sur une soumission (si toujours voulu)",
    pourquoi: "Savoir qui a modifié quoi",
    temps: "6–10 h",
  },
];

const oppRows = [
  {
    quoi: "Envoyer les soumissions depuis la vraie boîte Outlook de chaque vendeur / directeur (plusieurs boîtes), et les voir dans Éléments envoyés",
    pourquoi: "Comme voulu en rencontre. Demande une configuration Microsoft côté Huppé",
    temps: "23–34 h",
  },
  {
    quoi: "Calendrier simple pour les directeurs (cases vides OK, sans optimisation de trajet)",
    pourquoi: "Utile, moins urgent que le bon nom sur la soumission",
    temps: "8–12 h",
  },
  {
    quoi: "Ajouter des photos dans les soumissions",
    pourquoi: "Gros chantier",
    temps: "25–30 h",
  },
  {
    quoi: "Savoir si le client a ouvert le courriel",
    pourquoi: "Suivi (pas un avis de lecture Outlook classique)",
    temps: "6–10 h",
  },
];

const doc = h(
  Document,
  {
    title: "Proposition de travaux — système de soumissions",
    author: "Mikael",
    subject: "Urgent / À faire / Opportunité",
  },
  h(
    Page,
    { size: "LETTER", style: s.page },
    h(Header, { title: "Travaux proposés — système de soumissions" }),
    h(
      Text,
      { style: s.intro },
      "Voici la proposition de travaux avec estimations en heures, classée en trois groupes : Urgent, À faire et Opportunité."
    ),
    h(
      View,
      { style: s.box },
      h(Text, { style: s.h3 }, "Déjà possible aujourd’hui (rien à développer)"),
      h(
        Text,
        { style: s.p },
        "Pour ajouter une soumission à un client déjà dans le système : Clients → ouvrir l’adresse → Nouvelle soumission (ou Reprendre). Ça évite de créer plusieurs dossiers pour la même personne."
      )
    ),
    h(Text, { style: s.h2 }, "1. Urgent (~12 à 19 h)"),
    h(Table, { rows: urgentRows }),
    h(Text, { style: s.total }, "Total : 12–19 h"),
    h(Text, { style: s.h2 }, "2. À faire (~28 à 42 h)"),
    h(Table, { rows: aFaireRows }),
    h(Text, { style: s.total }, "Total : 28–42 h"),
    h(Text, { style: s.note }, "(dont une grosse partie pour les 5 options)"),
    h(Footer, null)
  ),
  h(
    Page,
    { size: "LETTER", style: s.page },
    h(Header, { title: "Travaux proposés — suite" }),
    h(Text, { style: s.h2 }, "3. Opportunité"),
    h(Table, { rows: oppRows }),
    h(Footer, null)
  )
);

await renderToFile(doc, OUT);
console.log("PDF créé :", OUT);
