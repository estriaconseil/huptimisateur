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
import {
  capageFieldsFromUnit,
  formatMountOptions,
  resolveMountOptions,
} from "@/lib/quote-mount-options";

// ── Enregistrement polices ────────────────────────────────────────────────────
Font.register({
  family: "Helvetica",
  fonts: [
    { src: "Helvetica" },
    { src: "Helvetica-Bold", fontWeight: "bold" },
  ],
});

// ── Palette (bleu logo Huppé) ─────────────────────────────────────────────────
const C = {
  primary: "#142033",
  brand: "#003B7C",
  brandSoft: "#e8f0f8",
  border: "#c8d0d8",
  bg: "#f4f7fa",
  muted: "#5c6b7a",
  white: "#ffffff",
  amberBg: "#fffbeb",
  amberBorder: "#fcd34d",
  amberText: "#92400e",
  warn: "#b91c1c",
};

// ── Taxes ─────────────────────────────────────────────────────────────────────
const TPS = 0.05;
const TVQ = 0.09975;
function calcTaxes(sub: number) {
  const tps = Math.round(sub * TPS * 100) / 100;
  const tvq = Math.round(sub * TVQ * 100) / 100;
  return { tps, tvq, total: Math.round((sub + tps + tvq) * 100) / 100 };
}
const fmt = (n: number) =>
  n.toLocaleString("fr-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const DIFF_LABELS: Record<string, string> = {
  easy: "Facile",
  medium: "Moyen",
  hard: "Difficile",
};

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: C.primary,
    paddingHorizontal: 32,
    paddingVertical: 28,
  },

  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  /** Largeur pour lire l’adresse/tél. dans le logo ; ratio ~1564×891 */
  logo: { width: 280, height: 160, objectFit: "contain" },
  titleBlock: { alignItems: "flex-end" },
  mainTitle: { fontSize: 20, fontWeight: "bold", letterSpacing: 1, color: C.primary },
  quoteNum: { fontSize: 18, fontWeight: "bold", color: C.brand, marginTop: 4 },
  dateLabel: { fontSize: 8, color: C.muted },
  dateValue: { fontSize: 9, fontWeight: "bold" },

  section: { marginBottom: 8, borderWidth: 1, borderColor: C.border, borderRadius: 6 },
  sectionHeader: {
    backgroundColor: C.bg,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  sectionTitle: {
    fontSize: 7.5,
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: C.brand,
  },
  sectionBody: { paddingHorizontal: 8, paddingVertical: 7 },

  row2: { flexDirection: "row", gap: 6, marginBottom: 4 },
  col: { flex: 1 },
  colLabel: { fontSize: 6.5, color: C.muted, marginBottom: 1 },
  colValue: { fontSize: 9, fontWeight: "bold", color: C.primary },

  // Pastilles specs (fond blanc + bordure — lisible N&B)
  chipRow: { flexDirection: "row", gap: 5, marginBottom: 5 },
  chip: {
    flex: 1,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 5,
    backgroundColor: C.white,
  },
  chipLabel: {
    fontSize: 6,
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 0.3,
    color: C.muted,
    marginBottom: 2,
  },
  chipValue: { fontSize: 9, fontWeight: "bold", color: C.primary },

  unitCard: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 6,
    overflow: "hidden",
    marginBottom: 8,
  },
  unitTop: {
    backgroundColor: C.brandSoft,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  unitTitle: { fontSize: 13, fontWeight: "bold", color: C.brand },
  unitBody: { paddingHorizontal: 8, paddingVertical: 7 },

  mountLine: {
    marginTop: 2,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 5,
    backgroundColor: C.bg,
  },
  mountLabel: {
    fontSize: 6,
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 0.3,
    color: C.muted,
    marginBottom: 2,
  },
  mountValue: { fontSize: 8.5, color: C.primary },

  // Prix
  priceStrip: { flexDirection: "row", alignItems: "stretch", marginTop: 6, gap: 0 },
  priceMain: {
    flex: 1.4,
    backgroundColor: C.brand,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    justifyContent: "center",
  },
  priceMainLbl: {
    fontSize: 6.5,
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 0.3,
    color: "rgba(255,255,255,0.85)",
    marginBottom: 3,
  },
  priceMainAmt: { fontSize: 13, fontWeight: "bold", color: C.white },
  priceOp: {
    width: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  priceOpText: { fontSize: 12, fontWeight: "bold", color: C.brand },
  priceSide: {
    flex: 1,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 8,
    justifyContent: "center",
    marginLeft: 4,
  },
  priceSideLbl: {
    fontSize: 6.5,
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 0.3,
    color: C.muted,
    marginBottom: 3,
  },
  priceSideAmt: { fontSize: 12, fontWeight: "bold", color: C.brand },

  // Financiers
  finTable: { borderWidth: 1, borderColor: C.border, borderRadius: 6, overflow: "hidden" },
  finRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  finRowTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingVertical: 7,
    backgroundColor: C.brand,
  },
  finRowInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: C.bg,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  finRowNet: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: C.brandSoft,
  },
  finLabel: { fontSize: 8, color: C.muted },
  finValue: { fontSize: 8, color: C.primary },
  finLabelBold: { fontSize: 10, fontWeight: "bold", color: C.white },
  finValueBold: { fontSize: 10, fontWeight: "bold", color: C.white },
  finLabelNet: { fontSize: 8, fontWeight: "bold", color: C.brand },
  finValueNet: { fontSize: 8, fontWeight: "bold", color: C.brand },

  legalBlock: { marginTop: 8, gap: 4 },
  legalText: { fontSize: 7, color: C.muted, lineHeight: 1.35 },
  legalTextBold: { fontSize: 7, fontWeight: "bold", color: C.primary, lineHeight: 1.35 },
  legalTextWarn: { fontSize: 7, color: C.warn, lineHeight: 1.35 },

  sigImage: { width: 180, height: 50, marginTop: 2, border: `1px solid ${C.border}` },

  sketchPage: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: C.primary,
    paddingHorizontal: 28,
    paddingVertical: 24,
  },
  sketchPageTitle: { fontSize: 12, fontWeight: "bold", letterSpacing: 0.4, marginBottom: 2 },
  sketchPageSub: { fontSize: 8, color: C.muted, marginBottom: 10 },
  sketchPageFrame: { borderWidth: 1, borderColor: C.border, width: 556, height: 700 },
  sketchPageImage: { width: 554, height: 698, objectFit: "contain" },

  altBanner: {
    backgroundColor: C.amberBg,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: C.amberBorder,
  },
  altBannerText: { fontSize: 9, fontWeight: "bold", color: C.amberText },

  checkRow: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 4 },
  checkItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    backgroundColor: C.white,
  },
  box: { width: 9, height: 9, border: `1.5px solid #444`, borderRadius: 1 },
  boxChecked: { width: 9, height: 9, backgroundColor: C.primary, borderRadius: 1 },
  checkLabel: { fontSize: 7.5, color: C.primary },
  checkLabelOff: { fontSize: 7.5, color: C.muted },

  notes: { fontSize: 8.5, color: C.primary, lineHeight: 1.35 },
  noteSame: { fontSize: 7, fontStyle: "italic", color: C.primary, marginTop: 4, marginBottom: 2 },
});

// ── Sous-composants ───────────────────────────────────────────────────────────

function CheckBox({ checked, label }: { checked: boolean; label: string }) {
  return (
    <View style={s.checkItem}>
      <View style={checked ? s.boxChecked : s.box} />
      <Text style={checked ? s.checkLabel : s.checkLabelOff}>{label}</Text>
    </View>
  );
}

type ChipItem = { label: string; value?: string | number | null; flex?: number };

/** Rangée de pastilles : champs vides masqués, le reste s’étire. */
function SpecRow({ items }: { items: ChipItem[] }) {
  const filled = items.filter(
    (i) => i.value !== null && i.value !== undefined && String(i.value).trim() !== "",
  );
  if (filled.length === 0) return null;
  return (
    <View style={s.chipRow}>
      {filled.map((i) => (
        <View key={i.label} style={[s.chip, { flex: i.flex ?? 1 }]}>
          <Text style={s.chipLabel}>{i.label}</Text>
          <Text style={s.chipValue}>{String(i.value)}</Text>
        </View>
      ))}
    </View>
  );
}

function LegalFooter() {
  return (
    <View style={s.legalBlock}>
      <Text style={[s.legalText, { fontStyle: "italic" }]}>
        En acceptant la présente soumission, le client s'engage à respecter le terme de paiement à
        l'installation.
      </Text>
      <Text style={s.legalText}>
        <Text style={s.legalTextBold}>Modes de paiements acceptés : </Text>
        Chèque, comptant, Visa, Mastercard. Financement disponible
      </Text>
      <Text style={s.legalTextWarn}>
        Un frais administratif de 40,00$ est applicable sur tout appel de service couvert par la garantie
        du fabricant. Aucun frais de déplacement ou de diagnostic. Les appels de service qui ne sont pas
        couverts par la garantie du fabricant seront facturables au taux horaire régulier. Les détails de
        garantie seront fournis avec la facturation. * Aucun frais applicable la première année.
      </Text>
    </View>
  );
}

function FinBlock({
  sub,
  tps,
  tvq,
  totalDue,
  subsidies,
  totalNet,
}: {
  sub: number;
  tps: number;
  tvq: number;
  totalDue: number;
  subsidies?: number;
  totalNet?: number;
}) {
  return (
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
        <Text style={s.finLabel}>TVQ (9,975%)</Text>
        <Text style={s.finValue}>{fmt(tvq)} $</Text>
      </View>
      <View style={s.finRowTotal}>
        <Text style={s.finLabelBold}>TOTAL DÛ</Text>
        <Text style={s.finValueBold}>{fmt(totalDue)} $</Text>
      </View>
      {subsidies != null && subsidies > 0 && (
        <View style={s.finRowInfo}>
          <Text style={s.finLabel}>Subventions (info)</Text>
          <Text style={s.finValue}>{fmt(subsidies)} $</Text>
        </View>
      )}
      {totalNet != null && subsidies != null && subsidies > 0 && (
        <View style={s.finRowNet}>
          <Text style={s.finLabelNet}>Total net (indicatif)</Text>
          <Text style={s.finValueNet}>{fmt(totalNet)} $</Text>
        </View>
      )}
    </View>
  );
}

// ── Bloc unité ────────────────────────────────────────────────────────────────
function UnitBlock({ u, idx }: { u: QuoteUnit; idx: number }) {
  const capages = capageFieldsFromUnit(u);
  const mountLabels = formatMountOptions(resolveMountOptions(u));
  const unitNum = idx + 1;
  const hasSerial = !!(u.serial_number?.trim() || u.serial_evaporator?.trim());
  const discount = u.discount_amount ?? 0;
  const subsidy = u.subsidy_amount ?? 0;
  const montant = u.unit_subtotal ?? 0;
  const plage = u.operating_temp_c != null ? `${u.operating_temp_c} °C` : null;

  return (
    <View style={s.unitCard} wrap={false}>
      <View style={s.unitTop}>
        <Text style={s.unitTitle}>
          Unité {unitNum}
          {u.description?.trim() ? `  —  ${u.description.trim()}` : ""}
        </Text>
      </View>
      <View style={s.unitBody}>
        <SpecRow
          items={[
            { label: "Marque", value: u.brand, flex: 1 },
            { label: "Modèle", value: u.model, flex: 2 },
          ]}
        />
        <SpecRow
          items={[
            { label: "Capacité (BTU)", value: u.capacity_btu },
            { label: "Plage fonctionnement", value: plage },
            { label: "Cap. chauf. à -25 °C", value: u.heating_capacity_25 },
          ]}
        />
        <SpecRow
          items={[
            { label: "Garantie pièces", value: u.warranty_parts },
            { label: "Garantie M-O", value: u.warranty_months },
            { label: "Pieds tuyaux", value: u.pipe_feet },
          ]}
        />
        <SpecRow
          items={[
            { label: "Capage 1", value: capages.capage_1 || null },
            { label: "Capage 2", value: capages.capage_2 || null },
            { label: "Capage 3", value: capages.capage_3 || null },
            { label: "Capage 4", value: capages.capage_4 || null },
          ]}
        />

        {(mountLabels || u.floor_mount_other) && (
          <View style={s.mountLine}>
            <Text style={s.mountLabel}>Support / Au sol</Text>
            <Text style={s.mountValue}>
              {[mountLabels, u.floor_mount_other ? `Autre : ${u.floor_mount_other}` : null]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          </View>
        )}

        {(montant > 0 || discount > 0 || subsidy > 0) && (
          <View style={s.priceStrip}>
            {montant > 0 && (
              <View style={s.priceMain}>
                <Text style={s.priceMainLbl}>Montant</Text>
                <Text style={s.priceMainAmt}>{fmt(montant)} $</Text>
              </View>
            )}
            {discount > 0 && (
              <>
                <View style={s.priceOp}>
                  <Text style={s.priceOpText}>−</Text>
                </View>
                <View style={[s.priceSide, { marginLeft: 0 }]}>
                  <Text style={s.priceSideLbl}>Rabais</Text>
                  <Text style={s.priceSideAmt}>{fmt(discount)} $</Text>
                </View>
              </>
            )}
            {subsidy > 0 && (
              <View style={s.priceSide}>
                <Text style={s.priceSideLbl}>Subvention</Text>
                <Text style={s.priceSideAmt}>{fmt(subsidy)} $</Text>
              </View>
            )}
          </View>
        )}

        {hasSerial && (
          <View style={{ marginTop: 5 }}>
            <SpecRow
              items={[
                { label: "# Série compresseur", value: u.serial_number?.trim() || null },
                { label: "# Série évaporateur", value: u.serial_evaporator?.trim() || null },
              ]}
            />
          </View>
        )}
      </View>
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
export function QuoteDocument({
  quote,
  units,
  salespersonName,
  logoBase64,
  installAddress = null,
  mode = "customer",
}: QuoteDocumentProps) {
  const accepted = quote.accepted_option ?? null;
  const isInstall = mode === "install";
  const chosen: "a" | "b" = accepted === "b" ? "b" : "a";

  const isPriced = (u: QuoteUnit) => (u.unit_subtotal ?? 0) > 0;
  const taxableOf = (list: QuoteUnit[]) =>
    list.reduce(
      (acc, u) => acc + Math.max(0, (u.unit_subtotal ?? 0) - (u.discount_amount ?? 0)),
      0,
    );
  const subsidiesOf = (list: QuoteUnit[]) =>
    list.reduce((acc, u) => acc + (u.subsidy_amount ?? 0), 0);
  const byOrder = (a: QuoteUnit, b: QuoteUnit) => (a.unit_order ?? 0) - (b.unit_order ?? 0);

  const aUnits = units.filter((u) => !u.is_alternative && isPriced(u)).sort(byOrder);
  const bUnits = units.filter((u) => u.is_alternative && isPriced(u)).sort(byOrder);

  const page1Units = chosen === "b" ? bUnits : aUnits;
  const page2Units = isInstall ? [] : chosen === "b" ? aUnits : bUnits;
  const page1Letter = chosen === "b" ? "B" : "A";
  const page2Letter = chosen === "b" ? "A" : "B";

  const aSub = taxableOf(aUnits);
  const bSub = taxableOf(bUnits);
  const sub = chosen === "b" ? bSub : aSub > 0 ? aSub : (quote.subtotal ?? 0);
  const { tps, tvq, total } = calcTaxes(sub);
  const subsidies = chosen === "b" ? subsidiesOf(bUnits) : subsidiesOf(aUnits);
  const totalDue = total;
  const computedTotalNet = Math.max(0, totalDue - subsidies);

  const otherSub = chosen === "b" ? aSub : bSub;
  const otherSubsidies = chosen === "b" ? subsidiesOf(aUnits) : subsidiesOf(bUnits);
  const { tps: otherTps, tvq: otherTvq, total: otherTotal } = calcTaxes(otherSub);
  const otherNet = Math.max(0, otherTotal - otherSubsidies);

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
        {/* ── En-tête (logo seul — texte déjà dans l’image) ──────── */}
        <View style={s.headerRow}>
          <View>{logoBase64 ? <Image src={logoBase64} style={s.logo} /> : null}</View>
          <View style={s.titleBlock}>
            <Text style={s.mainTitle}>{isInstall ? "INSTALLATION" : "SOUMISSION"}</Text>
            <Text style={s.quoteNum}>N° {quote.quote_number}</Text>
            <Text style={[s.dateLabel, { marginTop: 8 }]}>Date soumission</Text>
            <Text style={s.dateValue}>{quote.quote_date}</Text>
            {accepted && (
              <Text style={{ fontSize: 8, fontWeight: "bold", color: C.brand, marginTop: 4 }}>
                Option {page1Letter} retenue
              </Text>
            )}
          </View>
        </View>

        {/* ── Client ─────────────────────────────────────────────── */}
        <View style={s.section} wrap={false}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>Informations client</Text>
          </View>
          <View style={s.sectionBody}>
            <SpecRow
              items={[
                { label: "Nom", value: quote.client_name, flex: 1.2 },
                { label: "Téléphone", value: quote.client_phone, flex: 1 },
                { label: "Cellulaire", value: quote.client_cell, flex: 1 },
                { label: "Courriel", value: quote.client_email, flex: 1.6 },
              ]}
            />
            {(() => {
              const billing = (quote.client_address ?? "").trim();
              const install = (installAddress ?? "").trim();
              const differ =
                !!install && !!billing && install.toLowerCase() !== billing.toLowerCase();

              if (differ) {
                return (
                  <>
                    <SpecRow items={[{ label: "Adresse de facturation", value: quote.client_address }]} />
                    <SpecRow items={[{ label: "Adresse d'installation", value: installAddress }]} />
                  </>
                );
              }

              return (
                <>
                  <SpecRow
                    items={[
                      {
                        label: "Adresse d'installation",
                        value: install || quote.client_address,
                      },
                    ]}
                  />
                  {!!install && (
                    <Text style={s.noteSame}>
                      L'adresse de facturation est identique à l'adresse d'installation.
                    </Text>
                  )}
                </>
              );
            })()}
          </View>
        </View>

        {/* ── Équipements option page 1 ──────────────────────────── */}
        {page1Units.length > 0 && (
          <View style={{ marginBottom: 4 }}>
            <Text
              style={[s.sectionTitle, { marginBottom: 6, fontSize: 8 }]}
              minPresenceAhead={80}
            >
              {accepted
                ? `Équipements — Option ${page1Letter} (retenue)`
                : `Équipements — Option ${page1Letter}`}
            </Text>
            {page1Units.map((u, idx) => (
              <UnitBlock key={u.id} u={u} idx={idx} />
            ))}
          </View>
        )}

        {/* ── Détails installation ───────────────────────────────── */}
        <View style={s.section} wrap={false}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>Autres détails d'installation</Text>
          </View>
          <View style={s.sectionBody}>
            <SpecRow
              items={[
                {
                  label: "Durée des travaux",
                  value: quote.estimated_duration_hours
                    ? quote.estimated_duration_hours === 4
                      ? "Demi-journée (4 h)"
                      : "Journée complète (8 h)"
                    : null,
                },
                {
                  label: "Niveau",
                  value: jobMetaUnit?.difficulty
                    ? (DIFF_LABELS[jobMetaUnit.difficulty] ?? jobMetaUnit.difficulty)
                    : null,
                },
                {
                  label: "Techniciens",
                  value: jobMetaUnit?.tech_count ? `${jobMetaUnit.tech_count} tech.` : null,
                },
              ]}
            />

            <View style={s.checkRow}>
              {instItems.map(({ key, label }) => (
                <CheckBox key={key} checked={!!(quote[key] as boolean)} label={label} />
              ))}
            </View>

            {quote.notes ? (
              <View style={{ marginTop: 6 }}>
                <SpecRow items={[{ label: "Notes", value: quote.notes }]} />
              </View>
            ) : null}
          </View>
        </View>

        {/* ── Électricité ────────────────────────────────────────── */}
        {(quote.electrical_amperage ||
          quote.electrical_panel ||
          quote.electrical_included ||
          quote.electrical_not_included ||
          quote.electrical_to_schedule ||
          quote.electrical_initials) && (
          <View style={s.section} wrap={false}>
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>Informations électriques</Text>
            </View>
            <View style={s.sectionBody}>
              <SpecRow
                items={[
                  { label: "Ampérage", value: quote.electrical_amperage },
                  { label: "Panneau", value: quote.electrical_panel },
                  { label: "Initiales", value: quote.electrical_initials },
                ]}
              />
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
              <View style={{ flex: 1 }}>
                <SpecRow
                  items={[
                    { label: "Représentant", value: salespersonName },
                    { label: "Approuvé par (client)", value: quote.approved_by },
                  ]}
                />
                <View style={{ marginTop: 8 }}>
                  <Text style={s.colLabel}>Signature client</Text>
                  {quote.signature_data ? (
                    <Image src={quote.signature_data} style={s.sigImage} />
                  ) : (
                    <View
                      style={{
                        width: 180,
                        height: 50,
                        borderBottomWidth: 1,
                        borderBottomColor: C.border,
                        marginTop: 4,
                      }}
                    >
                      <Text style={[s.colLabel, { paddingTop: 34 }]}>Signature</Text>
                    </View>
                  )}
                </View>
              </View>
              <View style={{ width: 210 }}>
                <FinBlock
                  sub={sub}
                  tps={tps}
                  tvq={tvq}
                  totalDue={totalDue}
                  subsidies={subsidies}
                  totalNet={computedTotalNet}
                />
              </View>
            </View>
            <LegalFooter />
          </View>
        </View>
      </Page>

      {/* ── Croquis ──────────────────────────────────────────────── */}
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

      {/* ── Page option B / non retenue ─────────────────────────── */}
      {page2Units.length > 0 && (
        <Page size="LETTER" style={s.page}>
          <View style={s.altBanner}>
            <Text style={s.altBannerText}>
              {accepted
                ? `SOUMISSION #${quote.quote_number} — ${quote.client_name} — OPTION ${page2Letter} (PROPOSITION — NON RETENUE)`
                : `SOUMISSION #${quote.quote_number} — ${quote.client_name} — OPTION ${page2Letter}`}
            </Text>
          </View>

          <View style={{ marginBottom: 4 }}>
            <Text style={[s.sectionTitle, { marginBottom: 6, fontSize: 8 }]} minPresenceAhead={80}>
              {accepted
                ? `Équipements — Option ${page2Letter} (Proposition)`
                : `Équipements — Option ${page2Letter}`}
            </Text>
            {page2Units.map((u, idx) => (
              <UnitBlock key={u.id} u={u} idx={idx} />
            ))}
          </View>

          {!accepted && otherSub > 0 && (
            <View style={s.section} wrap={false}>
              <View style={s.sectionHeader}>
                <Text style={s.sectionTitle}>{`Financiers — Option ${page2Letter}`}</Text>
              </View>
              <View style={s.sectionBody}>
                <View style={{ marginLeft: "auto", width: 210 }}>
                  <FinBlock
                    sub={otherSub}
                    tps={otherTps}
                    tvq={otherTvq}
                    totalDue={otherTotal}
                    subsidies={otherSubsidies}
                    totalNet={otherNet}
                  />
                </View>
              </View>
            </View>
          )}
        </Page>
      )}
    </Document>
  );
}
