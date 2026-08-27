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
  section: { marginBottom: 7, borderWidth: 1, borderColor: C.border, borderRadius: 3 },
  sectionHeader: { backgroundColor: C.bg, paddingHorizontal: 7, paddingVertical: 3, borderBottomWidth: 1, borderBottomColor: C.border },
  sectionTitle: { fontSize: 7.5, fontWeight: "bold", textTransform: "uppercase", letterSpacing: 0.4, color: C.muted },
  sectionBody: { paddingHorizontal: 7, paddingVertical: 5 },

  // Grille 2 colonnes
  row2: { flexDirection: "row", gap: 8, marginBottom: 3 },
  col: { flex: 1 },
  colLabel: { fontSize: 6.5, color: C.muted, marginBottom: 0.5 },
  colValue: { fontSize: 8.5 },

  // Unité
  unitTitle: { fontSize: 9, fontWeight: "bold", marginBottom: 4, color: C.accent },
  unitGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 4 },
  unitCell: { width: "22%" },
  unitCellWide: { width: "47%" },
  unitCellFull: { width: "100%" },
  tag: { paddingHorizontal: 4, paddingVertical: 1, backgroundColor: C.bg, borderRadius: 2, border: `1px solid ${C.border}`, marginRight: 3, marginBottom: 1 },
  tagText: { fontSize: 6.5 },
  tagActive: { backgroundColor: C.accent, borderColor: C.accent },
  tagActiveText: { fontSize: 6.5, color: C.white },

  // Tableau financier
  finTable: { borderWidth: 1, borderColor: C.border, borderRadius: 4, overflow: "hidden" },
  finRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 8, paddingVertical: 3, borderBottomWidth: 1, borderBottomColor: C.border },
  finRowDark: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 8, paddingVertical: 4, backgroundColor: C.darkBg },
  finRowGreen: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 8, paddingVertical: 3, backgroundColor: C.greenBg },
  finLabel: { fontSize: 8, color: C.muted },
  finValue: { fontSize: 8 },
  finLabelBold: { fontSize: 9, fontWeight: "bold", color: C.white },
  finValueBold: { fontSize: 9, fontWeight: "bold", color: C.white },
  finLabelGreen: { fontSize: 8, fontWeight: "bold", color: C.green },
  finValueGreen: { fontSize: 8, fontWeight: "bold", color: C.green },

  // Textes légaux financiers
  legalBlock: { marginTop: 8, gap: 4 },
  legalText: { fontSize: 7, color: C.muted, lineHeight: 1.35 },
  legalTextBold: { fontSize: 7, fontWeight: "bold", color: C.primary, lineHeight: 1.35 },
  legalTextWarn: { fontSize: 7, color: "#b91c1c", lineHeight: 1.35 },

  // Signature
  sigImage: { width: 180, height: 50, marginTop: 2, border: `1px solid ${C.border}` },
  sigNotice: { fontSize: 7, color: C.muted, marginTop: 4, fontStyle: "italic" },

  // Croquis (page dédiée, format lettre)
  sketchPage: { fontFamily: "Helvetica", fontSize: 9, color: C.primary, paddingHorizontal: 28, paddingVertical: 24 },
  sketchPageTitle: { fontSize: 12, fontWeight: "bold", letterSpacing: 0.4, marginBottom: 2 },
  sketchPageSub: { fontSize: 8, color: C.muted, marginBottom: 10 },
  sketchPageFrame: { borderWidth: 1, borderColor: C.border, width: 556, height: 700 },
  sketchPageImage: { width: 554, height: 698, objectFit: "contain" },

  // Page alternative / option retenue
  altBanner: { backgroundColor: "#fffbeb", borderRadius: 4, paddingHorizontal: 8, paddingVertical: 4, marginBottom: 10, borderWidth: 1, borderColor: "#fcd34d" },
  altBannerText: { fontSize: 9, fontWeight: "bold", color: "#92400e" },

  // Checkbox list
  checkRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 },
  checkItem: { flexDirection: "row", alignItems: "center", gap: 3, width: "22%" },
  checkLabel: { fontSize: 7.5 },

  // Notes
  notes: { fontSize: 8, color: C.primary, lineHeight: 1.4 },

  // Séparateur unités
  unitSep: { borderTopWidth: 1, borderTopColor: C.border, marginVertical: 4 },

  divider: { borderTopWidth: 1, borderTopColor: C.border, marginVertical: 4 },
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

function CompactTags({ label, options, value }: { label: string; options: { v: string; l: string }[]; value: string | null }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={s.colLabel}>{label}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 1 }}>
        {options.map(({ v, l }) => (
          <View key={v} style={value === v ? [s.tag, s.tagActive] : s.tag}>
            <Text style={value === v ? s.tagActiveText : s.tagText}>{l}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Cellule fixe : label + valeur (— si vide) pour éviter les trous dans la grille. */
function Spec({
  label,
  value,
  flex = 1,
  last = false,
  bold = false,
  color,
}: {
  label: string;
  value?: string | number | null;
  flex?: number;
  last?: boolean;
  bold?: boolean;
  color?: string;
}) {
  const display = value === null || value === undefined || value === "" ? "—" : String(value);
  return (
    <View style={{ flex, marginRight: last ? 0 : 5 }}>
      <Text style={s.colLabel}>{label}</Text>
      <Text style={[s.colValue, bold ? { fontWeight: "bold" } : {}, color ? { color } : {}]}>{display}</Text>
    </View>
  );
}

function DenseRow({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: "row", marginBottom: 3, alignItems: "flex-start" }}>{children}</View>;
}

function LegalFooter() {
  return (
    <View style={s.legalBlock}>
      <Text style={[s.legalText, { fontStyle: "italic" }]}>
        En acceptant la présente soumission, le client s'engage à respecter le terme de paiement à l'installation.
      </Text>
      <Text style={s.legalText}>
        <Text style={s.legalTextBold}>Modes de paiements acceptés : </Text>
        Chèque, comptant, Visa, Mastercard. Financement disponible
      </Text>
      <Text style={s.legalTextWarn}>
        Un frais administratif de 40,00$ est applicable sur tout appel de service couvert par la garantie du fabricant. Aucun frais de déplacement ou de diagnostic. Les appels de service qui ne sont pas couverts par la garantie du fabricant seront facturables au taux horaire régulier. Les détails de garantie seront fournis avec la facturation. * Aucun frais applicable la première année.
      </Text>
    </View>
  );
}

// ── Bloc unité (réutilisable principal / alternatif) ─────────────────────────
function UnitBlock({ u, idx }: { u: QuoteUnit; idx: number }) {
  const tempLabel = u.operating_temp_c != null ? `${u.operating_temp_c} °C` : "—";
  const cap1L = stripAutofilledPostal(u.cap_long1_length) || "—";
  const cap1C = stripAutofilledPostal(u.cap_long1_color) || "—";
  const cap2L = stripAutofilledPostal(u.cap_long2_length) || "—";
  const cap2C = stripAutofilledPostal(u.cap_long2_color) || "—";
  const unitNum = idx + 1;
  const hasSerial = !!(u.serial_number?.trim() || u.serial_evaporator?.trim());

  return (
    <View wrap={false}>
      {idx > 0 && <View style={s.unitSep} />}
      <Text style={s.unitTitle}>
        Unité {unitNum}
        {u.description ? `  —  ${u.description}` : ""}
        {!u.description && (u.brand || u.model) ? `  —  ${[u.brand, u.model].filter(Boolean).join(" / ")}` : ""}
      </Text>

      {/* Ligne : Marque + Modèle */}
      <DenseRow>
        <Spec label="Marque" value={u.brand} flex={1} />
        <Spec label="Modèle" value={u.model} flex={3} last />
      </DenseRow>

      {/* Ligne : Capacité + Plage + Cap. chauf. */}
      <DenseRow>
        <Spec label="Capacité (BTU)" value={u.capacity_btu} />
        <Spec label="Plage fonctionnement" value={u.operating_temp_c != null ? `${u.operating_temp_c} °C` : null} />
        <Spec label={`Cap. chauf. à ${tempLabel}`} value={u.heating_capacity_25} last />
      </DenseRow>

      {/* Ligne : Garanties + pieds */}
      <DenseRow>
        <Spec label="Garantie pièces" value={u.warranty_parts} />
        <Spec label="Garantie M-O" value={u.warranty_months} />
        <Spec label="Pieds tuyaux" value={u.pipe_feet} last />
      </DenseRow>

      {/* Ligne : 4 Cap Long */}
      <DenseRow>
        <Spec label="Cap Long 1 — Long" value={cap1L === "—" ? null : cap1L} />
        <Spec label="Cap Long 1 — Coul." value={cap1C === "—" ? null : cap1C} />
        <Spec label="Cap Long 2 — Long" value={cap2L === "—" ? null : cap2L} />
        <Spec label="Cap Long 2 — Coul." value={cap2C === "—" ? null : cap2C} last />
      </DenseRow>

      {/* Support + Au sol — compact */}
      {(u.support_type || u.floor_mount_type || u.floor_mount_other) && (
        <View style={{ flexDirection: "row", marginBottom: 3, gap: 8 }}>
          {u.support_type && (
            <CompactTags
              label="Support"
              value={u.support_type}
              options={Object.entries(SUPPORT_LABELS).map(([v, l]) => ({ v, l }))}
            />
          )}
          {(u.floor_mount_type || u.floor_mount_other) && (
            <View style={{ flex: 1 }}>
              <CompactTags
                label="Au sol"
                value={u.floor_mount_type ?? ""}
                options={Object.entries(FLOOR_LABELS).map(([v, l]) => ({ v, l }))}
              />
              {u.floor_mount_other ? (
                <Text style={[s.colValue, { marginTop: 1, fontSize: 8 }]}>Autre : {u.floor_mount_other}</Text>
              ) : null}
            </View>
          )}
        </View>
      )}

      {/* Prix */}
      <DenseRow>
        <Spec
          label="Total unité"
          value={(u.unit_subtotal ?? 0) > 0 ? `${fmt(u.unit_subtotal ?? 0)} $` : null}
          bold
          color={C.accent}
        />
        <Spec
          label="Subvention"
          value={(u.subsidy_amount ?? 0) > 0 ? `−${fmt(u.subsidy_amount ?? 0)} $` : "0.00 $"}
          color={C.green}
          last
        />
      </DenseRow>

      {/* # série — ligne dédiée pour ne pas déformer la grille */}
      {hasSerial && (
        <DenseRow>
          <Spec label="# Série compresseur" value={u.serial_number?.trim() || null} />
          <Spec label="# Série évaporateur" value={u.serial_evaporator?.trim() || null} last />
        </DenseRow>
      )}
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
  /**
   * "customer" (défaut) : document complet envoyé/montré au client.
   *   Si accepted_option est défini, l'option non retenue est étiquetée "Proposition".
   * "install" : document épuré pour l'équipe d'installation.
   *   Seules les unités de l'option retenue sont incluses.
   */
  mode?: "customer" | "install";
};

// ── Document ──────────────────────────────────────────────────────────────────
export function QuoteDocument({ quote, units, salespersonName, logoBase64, installAddress = null, mode = "customer" }: QuoteDocumentProps) {
  const accepted = quote.accepted_option ?? null;
  const isInstall = mode === "install";
  const chosen: "a" | "b" = accepted === "b" ? "b" : "a";

  const isPriced = (u: QuoteUnit) => (u.unit_subtotal ?? 0) > 0;
  const grossOf = (list: QuoteUnit[]) =>
    list.reduce((acc, u) => acc + (u.unit_subtotal ?? 0), 0);
  const subsidiesOf = (list: QuoteUnit[]) =>
    list.reduce((acc, u) => acc + (u.subsidy_amount ?? 0), 0);
  const byOrder = (a: QuoteUnit, b: QuoteUnit) => (a.unit_order ?? 0) - (b.unit_order ?? 0);

  const aUnits = units.filter((u) => !u.is_alternative && isPriced(u)).sort(byOrder);
  const bUnits = units.filter((u) => u.is_alternative && isPriced(u)).sort(byOrder);

  // Page 1 = option retenue (B si choisie, sinon A). Page 2 = l'autre, client seulement.
  const page1Units = chosen === "b" ? bUnits : aUnits;
  const page2Units = isInstall ? [] : chosen === "b" ? aUnits : bUnits;
  const page1Letter = chosen === "b" ? "B" : "A";
  const page2Letter = chosen === "b" ? "A" : "B";

  const aSub = grossOf(aUnits);
  const bSub = grossOf(bUnits);
  const sub = chosen === "b" ? bSub : (aSub > 0 ? aSub : (quote.subtotal ?? 0));
  const { tps, tvq, total } = calcTaxes(sub);
  const subsidies = chosen === "b" ? subsidiesOf(bUnits) : subsidiesOf(aUnits);
  const totalDue = total;
  const computedTotalNet = Math.max(0, totalDue - subsidies);

  const otherSub = chosen === "b" ? aSub : bSub;
  const { tps: otherTps, tvq: otherTvq, total: otherTotal } = calcTaxes(otherSub);

  const jobMetaUnit = page1Units[0] ?? units.find((u) => u.difficulty || u.tech_count) ?? null;

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
      title={`${isInstall ? "Installation" : "Soumission"} #${quote.quote_number} — ${quote.client_name}${accepted ? ` — Option ${page1Letter}` : ""}`}
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
            <Text style={s.mainTitle}>{isInstall ? "INSTALLATION" : "SOUMISSION"}</Text>
            <Text style={s.quoteNum}>N° {quote.quote_number}</Text>
            {accepted && (
              <Text style={{ fontSize: 8, fontWeight: "bold", color: C.green, marginTop: 4 }}>
                Option {page1Letter} retenue
              </Text>
            )}
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

        {/* ── Équipements option page 1 ──────────────────────────── */}
        {page1Units.length > 0 && (
          <View style={s.section}>
            <View style={s.sectionHeader} minPresenceAhead={100}>
              <Text style={s.sectionTitle}>
                {accepted
                  ? `Équipements — Option ${page1Letter} (retenue)`
                  : `Équipements — Option ${page1Letter}`}
              </Text>
            </View>
            <View style={s.sectionBody}>
              {page1Units.map((u, idx) => (
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
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>
              {accepted ? `Financiers — Option ${page1Letter} (retenue)` : "Financiers"}
            </Text>
          </View>
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
              {/* Droite : prix */}
              <View style={{ width: 200 }}>
                <View style={s.finTable}>
                  <View style={s.finRow}>
                    <Text style={s.finLabel}>Sous-total</Text>
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
                    <Text style={s.finLabelBold}>Total dû</Text>
                    <Text style={s.finValueBold}>{fmt(totalDue)} $</Text>
                  </View>
                  {subsidies > 0 && (
                    <View style={s.finRow}>
                      <Text style={s.finLabel}>− Subventions (info)</Text>
                      <Text style={s.finValue}>{fmt(subsidies)} $</Text>
                    </View>
                  )}
                  <View style={s.finRowGreen}>
                    <Text style={s.finLabelGreen}>Total net (indicatif)</Text>
                    <Text style={s.finValueGreen}>{fmt(computedTotalNet)} $</Text>
                  </View>
                </View>
              </View>
            </View>
            <LegalFooter />
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

      {/* ── Page option non retenue (PDF client seulement) ──── */}
      {page2Units.length > 0 && (
        <Page size="LETTER" style={s.page}>
          <View style={s.altBanner}>
            <Text style={s.altBannerText}>
              {accepted
                ? `SOUMISSION #${quote.quote_number} — ${quote.client_name} — OPTION ${page2Letter} (PROPOSITION — NON RETENUE)`
                : `SOUMISSION #${quote.quote_number} — ${quote.client_name} — OPTION ${page2Letter}`}
            </Text>
          </View>

          <View style={s.section}>
            <View style={s.sectionHeader} minPresenceAhead={100}>
              <Text style={s.sectionTitle}>
                {accepted
                  ? `Équipements — Option ${page2Letter} (Proposition)`
                  : `Équipements — Option ${page2Letter}`}
              </Text>
            </View>
            <View style={s.sectionBody}>
              {page2Units.map((u, idx) => (
                <UnitBlock key={u.id} u={u} idx={idx} />
              ))}
            </View>
          </View>

          {!accepted && otherSub > 0 && (
            <View style={s.section} wrap={false}>
              <View style={s.sectionHeader}>
                <Text style={s.sectionTitle}>
                  {`Financiers — Option ${page2Letter}`}
                </Text>
              </View>
              <View style={s.sectionBody}>
                <View style={{ marginLeft: "auto", maxWidth: 220 }}>
                  <View style={s.finTable}>
                    <View style={s.finRow}>
                      <Text style={s.finLabel}>Sous-total</Text>
                      <Text style={s.finValue}>{fmt(otherSub)} $</Text>
                    </View>
                    <View style={s.finRow}>
                      <Text style={s.finLabel}>TPS (5%)</Text>
                      <Text style={s.finValue}>{fmt(otherTps)} $</Text>
                    </View>
                    <View style={s.finRow}>
                      <Text style={s.finLabel}>TVQ (9.975%)</Text>
                      <Text style={s.finValue}>{fmt(otherTvq)} $</Text>
                    </View>
                    <View style={s.finRowDark}>
                      <Text style={s.finLabelBold}>Total :</Text>
                      <Text style={s.finValueBold}>{fmt(otherTotal)} $</Text>
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
