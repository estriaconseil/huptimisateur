import React from "react";
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import type { ExcelExportDay } from "@/features/dispatch/build-excel-export-lines";

const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 11,
    color: "#111",
    paddingTop: 36,
    paddingBottom: 40,
    paddingHorizontal: 40,
  },
  title: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
  },
  hint: {
    fontSize: 8,
    color: "#666",
    marginBottom: 16,
  },
  dayTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    marginTop: 12,
    marginBottom: 4,
    textTransform: "capitalize",
    borderBottomWidth: 0.8,
    borderBottomColor: "#ccc",
    paddingBottom: 2,
  },
  line: {
    fontSize: 11,
    marginBottom: 2,
    fontFamily: "Courier",
  },
  empty: {
    fontSize: 10,
    color: "#888",
    fontStyle: "italic",
    marginBottom: 2,
  },
});

export type InstallWeekExportDocumentProps = {
  weekLabel: string;
  days: ExcelExportDay[];
};

/** PDF texte simple — sélectionner / copier facilement vers Excel. */
export function InstallWeekExportDocument({
  weekLabel,
  days,
}: InstallWeekExportDocumentProps) {
  return (
    <Document title={`Installations ${weekLabel}`}>
      <Page size="LETTER" style={s.page}>
        <Text style={s.title}>Installations — {weekLabel}</Text>
        <Text style={s.hint}>
          Format Excel : Nom AM|PM|AM-PM Ville — sélectionne le texte et colle dans ton calendrier dispatch.
        </Text>
        {days.map((day) => (
          <View key={day.date} wrap={false}>
            <Text style={s.dayTitle}>{day.heading}</Text>
            {day.lines.length === 0 ? (
              <Text style={s.empty}>(aucune job)</Text>
            ) : (
              day.lines.map((line, i) => (
                <Text key={`${day.date}-${i}`} style={s.line}>
                  {line}
                </Text>
              ))
            )}
          </View>
        ))}
      </Page>
    </Document>
  );
}
