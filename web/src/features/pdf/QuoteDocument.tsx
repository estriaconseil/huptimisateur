import React from "react";
import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import type { Quote, QuoteUnit } from "@/types/domain";
import { stripAutofilledPostal } from "@/lib/looks-like-postal";

// ── Enregistrement polices ────────────────────────────────────────────────────
// Helvetica est toujours disponible sans enregistrement dans react-pdf
Font.register({
  family: "Helvetica",
  fonts: [
    { src: "Helvetica" },
    { src: "Helvetica-Bold", fontWeight: "bold" },
  ],
});

// ── Palette ───────────────────────────────────────────────────────────────────
const C = {
  primary:   "#1a1a2e",
  accent:    "#0066cc",
  border:    "#d0d0d0",
  bg:        "#f7f7f7",
  muted:     "#666666",
  white:     "#ffffff",
  green:     "#065f46",
  greenBg:   "#ecfdf5",
  darkBg:    "#1a1a1a",
};

// ── Taxes ─────────────────────────────────────────────────────────────────────
const TPS = 0.05;
const TVQ = 0.09975;
function calcTaxes(sub: number) {
  const tps = Math.round(sub * TPS * 100) / 100;
  const tvq = Math.round(sub * TVQ * 100) / 100;
  return { tps, tvq, total: Math.round((sub + tps + tvq) * 100) / 100 };
}
const fmt = (n: number) => n.toFixed(2);

// ── Labels ────────────────────────────────────────────────────────────────────
const SUPPORT_LABELS: Record<string, string> = {
  regular: "Régulier", inverted: "Inversé", special: "Spécial", inverted_adj: "Inversé ajust.",
};
const FLOOR_LABELS: Record<string, string> = {
  alum_table: "Table alum.", plastic_base: "Base plast.", diversitech: "Diversitech",
};
const DIFF_LABELS: Record<string, string> = {
  easy: "Facile", medium: "Moyen", hard: "Difficile",
};
const STATUS_LABELS: Record<string, string> = {
  draft: "Brouillon", pending: "Va nous rappeler", accepted: "Acceptée", refused: "Refusée",
};

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 9, color: C.primary, paddingHorizontal: 32, paddingVertical: 28 },

  // En-tête
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 },
  logo: { width: 80, height: 40, objectFit: "contain" },
  companyText: { fontSize: 8, color: C.muted, lineHeight: 1.5 },
  companyName: { fontSize: 10, fontWeight: "bold", color: C.primary, marginBottom: 2 },
  titleBlock: { alignItems: "flex-end" },
  mainTitle: { fontSize: 20, fontWeight: "bold", letterSpacing: 1, color: C.primary },
  quoteNum: { fontSize: 12, fontWeight: "bold", color: C.accent, marginTop: 4 },
  statusPill: { marginTop: 4, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: C.bg, borderRadius: 999, border: `1px solid ${C.border}` },
  statusText: { fontSize: 8, color: C.muted },

  flagsRow: { flexDirection: "row", gap: 16, paddingTop: 8, marginBottom: 10, borderTopWidth: 1, borderTopColor: C.border },
  flagItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  box: { width: 9, height: 9, border: `1px solid ${C.border}`, borderRadius: 1 },
  boxChecked: { width: 9, height: 9, backgroundColor: C.accent, borderRadius: 1 },
  flagLabel: { fontSize: 8, color: C.muted },
  dateLabel: { fontSize: 8, color: C.muted },
  dateValue: { fontSize: 9, fontWeight: "bold" },

  // Section
  section: { marginBottom: 10, borderWidth: 1, borderColor: C.border, borderRadius: 4 },
  sectionHeader: { backgroundColor: C.bg, paddingHorizontal: 8, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: C.border },
  sectionTitle: { fontSize: 8, fontWeight: "bold", textTransform: "uppercase", letterSpacing: 0.5, color: C.muted },
  sectionBody: { paddingHorizontal: 8, paddingVertical: 6 },

  // Grille 2 colonnes
  row2: { flexDirection: "row", gap: 10, marginBottom: 4 },
  col: { flex: 1 },
  colLabel: { fontSize: 7, color: C.muted, marginBottom: 1 },
  colValue: { fontSize: 9 },

  // Unité
  unitTitle: { fontSize: 9, fontWeight: "bold", marginBottom: 6, color: C.accent },
  unitGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 4 },
  unitCell: { width: "22%" },
  unitCellWide: { width: "47%" },
  unitCellFull: { width: "100%" },
  tag: { paddingHorizontal: 5, paddingVertical: 1.5, backgroundColor: C.bg, borderRadius: 3, border: `1px solid ${C.border}`, marginRight: 4, marginBottom: 2 },
  tagText: { fontSize: 7 },
  tagActive: { backgroundColor: C.accent, borderColor: C.accent },
  tagActiveText: { fontSize: 7, color: C.white },

  // Tableau financier
  finTable: { borderWidth: 1, borderColor: C.border, borderRadius: 4, overflow: "hidden" },
  finRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 10, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: C.border },
  finRowDark: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 10, paddingVertical: 5, backgroundColor: C.darkBg },
  finRowGreen: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 10, paddingVertical: 4, backgroundColor: C.greenBg },
  finLabel: { fontSize: 9, color: C.muted },
  finValue: { fontSize: 9 },
  finLabelBold: { fontSize: 10, fontWeight: "bold", color: C.white },
  finValueBold: { fontSize: 10, fontWeight: "bold", color: C.white },
  finLabelGreen: { fontSize: 9, fontWeight: "bold", color: C.green },
  finValueGreen: { fontSize: 9, fontWeight: "bold", color: C.green },

  // Signature
  sigImage: { width: 200, height: 60, marginTop: 4, border: `1px solid ${C.border}` },
  sigNotice: { fontSize: 7, color: C.muted, marginTop: 4, fontStyle: "italic" },

  // Croquis (page dédiée, format lettre)
  sketchPage: { fontFamily: "Helvetica", fontSize: 9, color: C.primary, paddingHorizontal: 28, paddingVertical: 24 },
  sketchPageTitle: { fontSize: 12, fontWeight: "bold", letterSpacing: 0.4, marginBottom: 2 },
  sketchPageSub: { fontSize: 8, color: C.muted, marginBottom: 10 },
  sketchPageFrame: { borderWidth: 1, borderColor: C.border, width: 556, height: 700 },
  sketchPageImage: { width: 554, height: 698, objectFit: "contain" },

  // Page alternative
  altBanner: { backgroundColor: "#fffbeb", borderRadius: 4, paddingHorizontal: 8, paddingVertical: 4, marginBottom: 10, borderWidth: 1, borderColor: "#fcd34d" },
  altBannerText: { fontSize: 9, fontWeight: "bold", color: "#92400e" },

  // Checkbox list
  checkRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 2 },
  checkItem: { flexDirection: "row", alignItems: "center", gap: 3, width: "22%" },
  checkLabel: { fontSize: 8 },

  // Notes
  notes: { fontSize: 8, color: C.primary, lineHeight: 1.5 },

  // Séparateur unités
  unitSep: { borderTopWidth: 1, borderTopColor: C.border, marginVertical: 6 },

  divider: { borderTopWidth: 1, borderTopColor: C.border, marginVertical: 6 },
});

// ── Sous-composants ───────────────────────────────────────────────────────────

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <View style={s.col}>
      <Text style={s.colLabel}>{label}</Text>
      <Text style={s.colValue}>{value}</Text>
    </View>
  );
}

function CheckBox({ checked, label }: { checked: boolean; label: string }) {
  return (
    <View style={s.checkItem}>
      <View style={checked ? s.boxChecked : s.box} />
      <Text style={s.checkLabel}>{label}</Text>
    </View>
  );
}

function TagGroup({ label, options, value }: { label: string; options: { v: string; l: string }[]; value: string | null }) {
  return (
    <View style={{ marginBottom: 2 }}>
      <Text style={s.colLabel}>{label}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 2 }}>
        {options.map(({ v, l }) => (
          <View key={v} style={value === v ? [s.tag, s.tagActive] : s.tag}>
            <Text style={value === v ? s.tagActiveText : s.tagText}>{l}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Cellule de grille (marginRight explicite, pas de gap) ────────────────────
const cell = { flex: 1, marginRight: 6 } as const;
const cellHalf = { flex: 2, marginRight: 6 } as const;
const cellFull = { flex: 1 } as const; // dernière cellule de la rangée, pas de marginRight

// ── Rangée de champs ─────────────────────────────────────────────────────────
function FieldRow({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: "row", marginBottom: 5 }}>{children}</View>;
}

// ── Bloc unité (réutilisable principal / alternatif) ─────────────────────────
function UnitBlock({ u, idx }: { u: QuoteUnit; idx: number }) {
  const hasSpecs = u.capacity_btu || u.heating_capacity_25 || u.warranty_parts || u.warranty_months;
  const cap1 = [stripAutofilledPostal(u.cap_long1_length), stripAutofilledPostal(u.cap_long1_color)].filter(Boolean);
  const cap2 = [stripAutofilledPostal(u.cap_long2_length), stripAutofilledPostal(u.cap_long2_color)].filter(Boolean);
  const hasPiping = !!(u.evaporator || u.pipe_feet || cap1.length || cap2.length);
  const unitNet = Math.max(0, (u.unit_subtotal ?? 0) - (u.subsidy_amount ?? 0));
  const unitNum = idx + 1;

  return (
    <View wrap={false}>
      {idx > 0 && <View style={s.unitSep} />}
      <Text style={s.unitTitle}>
        Unité {unitNum}
        {u.brand || u.model ? `  —  ${[u.brand, u.model].filter(Boolean).join(" / ")}` : ""}
      </Text>

      {/* Description */}
      {u.description && (
        <View style={{ marginBottom: 5 }}>
          <Text style={s.colLabel}>Description / Emplacement</Text>
          <Text style={s.colValue}>{u.description}</Text>
        </View>
      )}

      {/* Marque + Modèle */}
      {(u.brand || u.model) && (
        <FieldRow>
          <View style={cell}>
            <Text style={s.colLabel}>Marque</Text>
            <Text style={s.colValue}>{u.brand ?? "—"}</Text>
          </View>
          <View style={cellFull}>
            <Text style={s.colLabel}>Modèle</Text>
            <Text style={s.colValue}>{u.model ?? "—"}</Text>
          </View>
        </FieldRow>
      )}

      {/* Spécifications techniques */}
      {hasSpecs && (
        <FieldRow>
          {u.capacity_btu ? (
            <View style={cell}>
              <Text style={s.colLabel}>Capacité (BTU)</Text>
              <Text style={s.colValue}>{u.capacity_btu}</Text>
            </View>
          ) : <View style={cell} />}
          {u.heating_capacity_25 ? (
            <View style={cell}>
              <Text style={s.colLabel}>Cap. Chauf. -25°C</Text>
              <Text style={s.colValue}>{u.heating_capacity_25}</Text>
            </View>
          ) : <View style={cell} />}
          {u.warranty_parts ? (
            <View style={cell}>
              <Text style={s.colLabel}>Garantie pièces</Text>
              <Text style={s.colValue}>{u.warranty_parts}</Text>
            </View>
          ) : <View style={cell} />}
          {u.warranty_months ? (
            <View style={cellFull}>
              <Text style={s.colLabel}>Garantie M-O</Text>
              <Text style={s.colValue}>{u.warranty_months}</Text>
            </View>
          ) : <View style={cellFull} />}
        </FieldRow>
      )}

      {/* Tuyauterie */}
      {hasPiping && (
        <FieldRow>
          {u.evaporator ? (
            <View style={cell}>
              <Text style={s.colLabel}>Évaporateur</Text>
              <Text style={s.colValue}>{u.evaporator}</Text>
            </View>
          ) : <View style={cell} />}
          {u.pipe_feet ? (
            <View style={cell}>
              <Text style={s.colLabel}>Pieds tuyaux</Text>
              <Text style={s.colValue}>{u.pipe_feet}</Text>
            </View>
          ) : <View style={cell} />}
          {cap1.length ? (
            <View style={cell}>
              <Text style={s.colLabel}>Cap Long 1</Text>
              <Text style={s.colValue}>{cap1.join(" — ")}</Text>
            </View>
          ) : <View style={cell} />}
          {cap2.length ? (
            <View style={cellFull}>
              <Text style={s.colLabel}>Cap Long 2</Text>
              <Text style={s.colValue}>{cap2.join(" — ")}</Text>
            </View>
          ) : <View style={cellFull} />}
        </FieldRow>
      )}

      {/* Support + Au sol */}
      {(u.support_type || u.floor_mount_type) && (
        <FieldRow>
          {u.support_type && (
            <View style={cell}>
              <TagGroup label="Support" value={u.support_type} options={Object.entries(SUPPORT_LABELS).map(([v, l]) => ({ v, l }))} />
            </View>
          )}
          {u.floor_mount_type && (
            <View style={cellFull}>
              <TagGroup label="Au sol" value={u.floor_mount_type} options={Object.entries(FLOOR_LABELS).map(([v, l]) => ({ v, l }))} />
            </View>
          )}
        </FieldRow>
      )}

      {/* Total − Subvention = Net + # Série */}
      <FieldRow>
        {(u.unit_subtotal ?? 0) > 0 && (
          <View style={cell}>
            <Text style={s.colLabel}>Total unité</Text>
            <Text style={[s.colValue, { fontWeight: "bold", color: C.accent }]}>{fmt(u.unit_subtotal ?? 0)} $</Text>
          </View>
        )}
        <View style={cell}>
          <Text style={s.colLabel}>Subvention</Text>
          <Text style={[s.colValue, { color: C.green }]}>
            {(u.subsidy_amount ?? 0) > 0 ? `−${fmt(u.subsidy_amount ?? 0)} $` : "0.00 $"}
          </Text>
        </View>
        {(u.unit_subtotal ?? 0) > 0 && (
          <View style={cell}>
            <Text style={s.colLabel}>Net unité</Text>
            <Text style={[s.colValue, { fontWeight: "bold", color: C.green }]}>{fmt(unitNet)} $</Text>
          </View>
        )}
        {u.serial_number ? (
          <View style={cellFull}>
            <Text style={s.colLabel}># Série</Text>
            <Text style={s.colValue}>{u.serial_number}</Text>
          </View>
        ) : <View style={cellFull} />}
      </FieldRow>
    </View>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────
export type QuoteDocumentProps = {
  quote: Quote;
  units: QuoteUnit[];
  salespersonName?: string | null;
  logoBase64?: string | null;
  /** Adresse d'installation (chantier) — pour affichage distinct si différente de la facturation */
  installAddress?: string | null;
};

// ── Document ──────────────────────────────────────────────────────────────────
export function QuoteDocument({ quote, units, salespersonName, logoBase64, installAddress = null }: QuoteDocumentProps) {
  const sub = quote.subtotal ?? 0;
  const { tps, tvq, total } = calcTaxes(sub);
  const deposit = quote.deposit ?? 0;
  const computedTotalNet = Math.max(0, total - deposit);

  const isFilled = (u: QuoteUnit) => !!(u.brand || u.model || u.description || (u.unit_subtotal ?? 0) > 0);
  const principalUnits = units
    .filter((u) => !u.is_alternative && isFilled(u))
    .sort((a, b) => (a.unit_order ?? 0) - (b.unit_order ?? 0));
  const altUnits = units
    .filter((u) => u.is_alternative && isFilled(u))
    .sort((a, b) => (a.unit_order ?? 0) - (b.unit_order ?? 0));
  // Sous-total Option B = somme des nets (total − subvention)
  const altSub = altUnits.reduce(
    (acc, u) => acc + Math.max(0, (u.unit_subtotal ?? 0) - (u.subsidy_amount ?? 0)),
    0
  );
  const { tps: altTps, tvq: altTvq, total: altTotal } = calcTaxes(altSub);

  const jobMetaUnit = principalUnits[0] ?? units.find((u) => u.difficulty || u.tech_count) ?? null;

  const instItems: { key: keyof Quote; label: string }[] = [
    { key: "inst_prepiping", label: "Prépiping" },
    { key: "inst_drill_concrete", label: "Drill béton" },
    { key: "inst_through_attic", label: "Par grenier" },
    { key: "inst_through_basement", label: "Par sous-sol" },
    { key: "inst_through_garage", label: "Par garage" },
    { key: "inst_through_closet", label: "Par garde-robe" },
    { key: "inst_appliance_change", label: "Changement appareil" },
    { key: "inst_through_stairs", label: "Ds Escalier" },
  ];

  return (
    <Document
      title={`Soumission #${quote.quote_number} — ${quote.client_name}`}
      author="Huppé Réfrigération"
      creator="Huppé CRM"
    >
      <Page size="LETTER" style={s.page}>

        {/* ── En-tête ────────────────────────────────────────────── */}
        <View style={s.headerRow}>
          <View>
            {logoBase64 && (
              <Image src={logoBase64} style={s.logo} />
            )}
            <Text style={s.companyName}>Huppé Réfrigération</Text>
            <Text style={s.companyText}>2710, King Est, Sherbrooke, QC J1G 5H1{"\n"}Tél. 819 566-8061{"\n"}huppe@hupperefrigeration.com</Text>
          </View>
          <View style={s.titleBlock}>
            <Text style={s.mainTitle}>SOUMISSION</Text>
            <Text style={s.quoteNum}>N° {quote.quote_number}</Text>
          </View>
        </View>

        <View style={s.flagsRow}>
          <View style={{ marginLeft: "auto", alignItems: "flex-end" }}>
            <Text style={s.dateLabel}>Date soumission</Text>
            <Text style={s.dateValue}>{quote.quote_date}</Text>
          </View>
        </View>

        {/* ── Client ─────────────────────────────────────────────── */}
        <View style={s.section} wrap={false}>
          <View style={s.sectionHeader}><Text style={s.sectionTitle}>Informations client</Text></View>
          <View style={s.sectionBody}>
            <View style={s.row2}>
              <View style={{ flex: 2 }}>
                <Text style={s.colLabel}>Nom</Text>
                <Text style={[s.colValue, { fontWeight: "bold" }]}>{quote.client_name}</Text>
              </View>
            </View>
            {(() => {
              const billing = (quote.client_address ?? "").trim();
              const install = (installAddress ?? "").trim();
              const differ =
                !!install &&
                !!billing &&
                install.toLowerCase() !== billing.toLowerCase();

              if (differ) {
                return (
                  <>
                    <View style={s.row2}>
                      <Field label="Adresse de facturation" value={quote.client_address} />
                    </View>
                    <View style={s.row2}>
                      <Field label="Adresse d'installation" value={installAddress} />
                    </View>
                  </>
                );
              }

              return (
                <>
                  <View style={s.row2}>
                    <Field label="Adresse" value={quote.client_address} />
                  </View>
                  {!!install && (
                    <View style={{ marginBottom: 4 }}>
                      <Text style={{ fontSize: 7, color: C.accent, fontStyle: "italic" }}>
                        L'adresse de facturation est identique à l'adresse d'installation.
                      </Text>
                    </View>
                  )}
                </>
              );
            })()}
            <View style={s.row2}>
              <Field label="Téléphone" value={quote.client_phone} />
              <Field label="Cellulaire" value={quote.client_cell} />
              <Field label="Courriel" value={quote.client_email} />
            </View>
          </View>
        </View>

        {/* ── Équipements Option A ───────────────────────────────── */}
        {principalUnits.length > 0 && (
          <View style={s.section}>
            <View style={s.sectionHeader} minPresenceAhead={100}>
              <Text style={s.sectionTitle}>Équipements — Option A</Text>
            </View>
            <View style={s.sectionBody}>
              {principalUnits.map((u, idx) => (
                <UnitBlock key={u.id} u={u} idx={idx} />
              ))}
            </View>
          </View>
        )}

        {/* ── Détails installation ───────────────────────────────── */}
        <View style={s.section} wrap={false}>
          <View style={s.sectionHeader}><Text style={s.sectionTitle}>Autres détails d'installation</Text></View>
          <View style={s.sectionBody}>
            <View style={s.row2}>
              {quote.estimated_duration_hours && (
                <View style={s.col}>
                  <Text style={s.colLabel}>Durée des travaux</Text>
                  <Text style={s.colValue}>
                    {quote.estimated_duration_hours === 4 ? "Demi-journée (4 h)" : "Journée complète (8 h)"}
                  </Text>
                </View>
              )}
              {(jobMetaUnit?.difficulty || jobMetaUnit?.tech_count) && (
                <View style={s.col}>
                  {jobMetaUnit?.difficulty && (
                    <>
                      <Text style={s.colLabel}>Niveau</Text>
                      <Text style={s.colValue}>{DIFF_LABELS[jobMetaUnit.difficulty] ?? jobMetaUnit.difficulty}</Text>
                    </>
                  )}
                </View>
              )}
              {jobMetaUnit?.tech_count && (
                <View style={s.col}>
                  <Text style={s.colLabel}>Techniciens</Text>
                  <Text style={s.colValue}>{jobMetaUnit.tech_count} tech.</Text>
                </View>
              )}
            </View>

            <View style={s.checkRow}>
              {instItems.map(({ key, label }) => (
                <CheckBox key={key} checked={!!(quote[key] as boolean)} label={label} />
              ))}
            </View>

            {quote.notes && (
              <View style={{ marginTop: 6 }}>
                <Text style={s.colLabel}>Notes</Text>
                <Text style={s.notes}>{quote.notes}</Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Électricité ────────────────────────────────────────── */}
        {(quote.electrical_amperage || quote.electrical_panel || quote.electrical_included || quote.electrical_not_included || quote.electrical_to_schedule || quote.electrical_initials) && (
          <View style={s.section} wrap={false}>
            <View style={s.sectionHeader}><Text style={s.sectionTitle}>Informations électriques</Text></View>
            <View style={s.sectionBody}>
              <View style={s.row2}>
                <Field label="Ampérage" value={quote.electrical_amperage} />
                <Field label="Panneau" value={quote.electrical_panel} />
                {quote.electrical_initials && <Field label="Initiales" value={quote.electrical_initials} />}
              </View>
              <View style={s.checkRow}>
                <CheckBox checked={quote.electrical_included} label="Élect. incluse" />
                <CheckBox checked={quote.electrical_not_included} label="Élect. non incluse" />
                <CheckBox checked={quote.electrical_to_schedule} label="Élect. à céduler" />
              </View>
            </View>
          </View>
        )}

        {/* ── Financiers + signature ─────────────────────────────── */}
        <View style={s.section} wrap={false}>
          <View style={s.sectionHeader}><Text style={s.sectionTitle}>Financiers</Text></View>
          <View style={s.sectionBody}>
            <View style={{ flexDirection: "row", gap: 16 }}>
              {/* Gauche : représentant + signature */}
              <View style={{ flex: 1 }}>
                <View style={s.row2}>
                  {salespersonName && <Field label="Représentant" value={salespersonName} />}
                  {quote.approved_by && <Field label="Approuvé par (client)" value={quote.approved_by} />}
                </View>
                <View style={{ marginTop: 8 }}>
                  <Text style={s.colLabel}>Signature client</Text>
                  {quote.signature_data ? (
                    <Image src={quote.signature_data} style={s.sigImage} />
                  ) : (
                    <View style={{ width: 180, height: 50, borderBottomWidth: 1, borderBottomColor: C.border, marginTop: 4 }}>
                      <Text style={[s.colLabel, { paddingTop: 34 }]}>Signature</Text>
                    </View>
                  )}
                </View>
              </View>
              {/* Droite : prix + texte légal */}
              <View style={{ width: 220 }}>
                <View style={s.finTable}>
                  <View style={s.finRow}>
                    <Text style={s.finLabel}>Sous-total (nets)</Text>
                    <Text style={s.finValue}>{fmt(sub)} $</Text>
                  </View>
                  <View style={s.finRow}>
                    <Text style={s.finLabel}>TPS (5%)</Text>
                    <Text style={s.finValue}>{fmt(tps)} $</Text>
                  </View>
                  <View style={s.finRow}>
                    <Text style={s.finLabel}>TVQ (9.975%)</Text>
                    <Text style={s.finValue}>{fmt(tvq)} $</Text>
                  </View>
                  <View style={s.finRowDark}>
                    <Text style={s.finLabelBold}>TOTAL</Text>
                    <Text style={s.finValueBold}>{fmt(total)} $</Text>
                  </View>
                  <View style={s.finRow}>
                    <Text style={s.finLabel}>− Dépôt</Text>
                    <Text style={s.finValue}>{fmt(deposit)} $</Text>
                  </View>
                  <View style={s.finRowGreen}>
                    <Text style={s.finLabelGreen}>Total net</Text>
                    <Text style={s.finValueGreen}>{fmt(computedTotalNet)} $</Text>
                  </View>
                </View>
                <Text style={[s.sigNotice, { marginTop: 6 }]}>
                  En acceptant la présente soumission, le client s'engage à respecter le terme de paiement à l'installation.
                </Text>
              </View>
            </View>
          </View>
        </View>

      </Page>

      {/* ── Croquis : une page lettre pleine ─────────────────────── */}
      {quote.sketch_data && (
        <Page size="LETTER" style={s.sketchPage}>
          <Text style={s.sketchPageTitle}>Croquis / plan d'installation</Text>
          <Text style={s.sketchPageSub}>
            Soumission #{quote.quote_number} — {quote.client_name}
          </Text>
          <View style={s.sketchPageFrame}>
            <Image src={quote.sketch_data} style={s.sketchPageImage} />
          </View>
        </Page>
      )}

      {/* ── Page Option B ──────────────────────────────────── */}
      {altUnits.length > 0 && (
        <Page size="LETTER" style={s.page}>
          <View style={s.altBanner}>
            <Text style={s.altBannerText}>SOUMISSION #{quote.quote_number} — {quote.client_name} — OPTION B</Text>
          </View>

          <View style={s.section}>
            <View style={s.sectionHeader} minPresenceAhead={100}>
              <Text style={s.sectionTitle}>Équipements — Option B</Text>
            </View>
            <View style={s.sectionBody}>
              {altUnits.map((u, idx) => (
                <UnitBlock key={u.id} u={u} idx={idx} />
              ))}
            </View>
          </View>

          {altSub > 0 && (
            <View style={s.section} wrap={false}>
              <View style={s.sectionHeader}><Text style={s.sectionTitle}>Financiers — Option B</Text></View>
              <View style={s.sectionBody}>
                <View style={{ marginLeft: "auto", maxWidth: 220 }}>
                  <View style={s.finTable}>
                    <View style={s.finRow}>
                      <Text style={s.finLabel}>Sous-total (nets)</Text>
                      <Text style={s.finValue}>{fmt(altSub)} $</Text>
                    </View>
                    <View style={s.finRow}>
                      <Text style={s.finLabel}>TPS (5%)</Text>
                      <Text style={s.finValue}>{fmt(altTps)} $</Text>
                    </View>
                    <View style={s.finRow}>
                      <Text style={s.finLabel}>TVQ (9.975%)</Text>
                      <Text style={s.finValue}>{fmt(altTvq)} $</Text>
                    </View>
                    <View style={s.finRowDark}>
                      <Text style={s.finLabelBold}>Total :</Text>
                      <Text style={s.finValueBold}>{fmt(altTotal)} $</Text>
                    </View>
                  </View>
                </View>
              </View>
            </View>
          )}
        </Page>
      )}

    </Document>
  );
}
