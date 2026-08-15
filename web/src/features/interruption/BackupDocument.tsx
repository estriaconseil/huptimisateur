import React from "react";
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import { formatDayHeading } from "@/features/interruption/date-utils";
import type { BackupPayload, BackupInstallRow, BackupSalesRow } from "@/features/interruption/types";

const styles = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingBottom: 36,
    paddingHorizontal: 28,
    fontSize: 8,
    fontFamily: "Helvetica",
    color: "#1a1a1a",
  },
  title: { fontSize: 14, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  subtitle: { fontSize: 9, color: "#444", marginBottom: 2 },
  muted: { fontSize: 8, color: "#666", marginBottom: 12 },
  section: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    marginTop: 14,
    marginBottom: 6,
    backgroundColor: "#1a1a2e",
    color: "#fff",
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  day: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    marginTop: 8,
    marginBottom: 3,
    textTransform: "capitalize",
    borderBottomWidth: 0.5,
    borderBottomColor: "#ccc",
    paddingBottom: 2,
  },
  sp: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    marginTop: 4,
    marginBottom: 2,
    color: "#0066cc",
  },
  row: { flexDirection: "row", marginBottom: 2, alignItems: "flex-start" },
  blockRow: { flexDirection: "row", marginBottom: 2, backgroundColor: "#f0f0f0", paddingVertical: 1 },
  cTime: { width: "8%" },
  cName: { width: "18%" },
  cPhone: { width: "14%" },
  cAddr: { width: "32%" },
  cStatus: { width: "12%" },
  cQuote: { width: "16%" },
  iSlot: { width: "8%" },
  iName: { width: "16%" },
  iPhone: { width: "12%" },
  iAddr: { width: "28%" },
  iDur: { width: "6%" },
  iNotes: { width: "18%" },
  iQuote: { width: "12%" },
  empty: { marginTop: 8, fontSize: 9, color: "#666", fontStyle: "italic" },
  footer: {
    position: "absolute",
    bottom: 16,
    left: 28,
    right: 28,
    fontSize: 7,
    color: "#888",
    borderTopWidth: 0.5,
    borderTopColor: "#ddd",
    paddingTop: 4,
  },
});

function SalesDay({
  date,
  rows,
}: {
  date: string;
  rows: BackupSalesRow[];
}) {
  const bySp = new Map<string, BackupSalesRow[]>();
  for (const r of rows) {
    const list = bySp.get(r.salespersonName) ?? [];
    list.push(r);
    bySp.set(r.salespersonName, list);
  }

  return (
    <View wrap={false}>
      <Text style={styles.day}>{formatDayHeading(date)}</Text>
      {[...bySp.entries()].map(([sp, list]) => (
        <View key={sp}>
          <Text style={styles.sp}>{sp}</Text>
          {list.map((r, i) => (
            <View key={`${sp}-${i}`} style={r.isBlock ? styles.blockRow : styles.row}>
              <Text style={styles.cTime}>{r.time}</Text>
              <Text style={styles.cName}>{r.clientName}</Text>
              <Text style={styles.cPhone}>{r.phone}</Text>
              <Text style={styles.cAddr}>{r.address}</Text>
              <Text style={styles.cStatus}>{r.statusLabel}</Text>
              <Text style={styles.cQuote}>{r.quoteNumber}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function InstallDay({
  date,
  rows,
}: {
  date: string;
  rows: BackupInstallRow[];
}) {
  const byTeam = new Map<string, BackupInstallRow[]>();
  for (const r of rows) {
    const list = byTeam.get(r.teamName) ?? [];
    list.push(r);
    byTeam.set(r.teamName, list);
  }

  return (
    <View wrap={false}>
      <Text style={styles.day}>{formatDayHeading(date)}</Text>
      {[...byTeam.entries()].map(([team, list]) => (
        <View key={team}>
          <Text style={styles.sp}>{team}</Text>
          {list.map((r, i) => (
            <View key={`${team}-${i}`} style={styles.row}>
              <Text style={styles.iSlot}>{r.slotLabel}</Text>
              <Text style={styles.iName}>{r.clientName}</Text>
              <Text style={styles.iPhone}>{r.phone}</Text>
              <Text style={styles.iAddr}>{r.address}</Text>
              <Text style={styles.iDur}>{r.durationLabel}</Text>
              <Text style={styles.iNotes}>{r.notes}</Text>
              <Text style={styles.iQuote}>{r.quoteNumber}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

export function BackupDocument({ data }: { data: BackupPayload }) {
  const salesDates = Object.keys(data.salesByDate).sort();
  const installDates = Object.keys(data.installByDate).sort();
  const generatedLabel = new Date(data.generatedAtIso).toLocaleString("fr-CA", {
    timeZone: "America/Toronto",
  });

  return (
    <Document
      title={`Huppé — horaires secours ${data.periodStart}–${data.periodEnd}`}
      author="Huptimisateur"
    >
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.title}>Huppé — Horaires de secours</Text>
        <Text style={styles.subtitle}>
          Généré : {generatedLabel} (heure du Québec)
        </Text>
        <Text style={styles.subtitle}>
          Semaine 1 : {data.week1Label} · Semaine 2 : {data.week2Label}
        </Text>
        <Text style={styles.muted}>
          Document de secours — source de vérité = Huppe au retour. Ne pas utiliser comme planning
          définitif après rétablissement.
        </Text>

        <Text style={styles.section}>VENTES</Text>
        {data.salesEmpty ? (
          <Text style={styles.empty}>Aucun rendez-vous de vente sur la période.</Text>
        ) : (
          salesDates.map((d) => (
            <SalesDay key={d} date={d} rows={data.salesByDate[d]} />
          ))
        )}

        <Text style={styles.section}>INSTALLATIONS</Text>
        {data.installEmpty ? (
          <Text style={styles.empty}>Aucun job d installation booké sur la période.</Text>
        ) : (
          installDates.map((d) => (
            <InstallDay key={d} date={d} rows={data.installByDate[d]} />
          ))
        )}

        {data.salesEmpty && data.installEmpty && (
          <Text style={styles.empty}>Aucun rendez-vous sur les deux semaines.</Text>
        )}

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            `Huptimisateur — Interruption · page ${pageNumber}/${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>
  );
}
