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
  draft: "Brouillon", pending: "En attente", accepted: "Acceptée", refused: "Refusée",
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

// ── Props ─────────────────────────────────────────────────────────────────────
export type QuoteDocumentProps = {
  quote: Quote;
  units: QuoteUnit[];
  salespersonName?: string | null;
  logoBase64?: string | null;
};

// ── Document ──────────────────────────────────────────────────────────────────
export function QuoteDocument({ quote, units, salespersonName, logoBase64 }: QuoteDocumentProps) {
  const sub = quote.subtotal ?? 0;
  const { tps, tvq, total } = calcTaxes(sub);
  const deposit = quote.deposit ?? null;
  const montantSubv = quote.montant_subvention ?? null;
  const totalNet = quote.total_net ?? (montantSubv != null ? Math.max(0, sub - montantSubv) : null);

  const filledUnits = units.filter((u) => u.brand || u.model || u.description || (u.unit_subtotal ?? 0) > 0);

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
            <View style={s.statusPill}>
              <Text style={s.statusText}>{STATUS_LABELS[quote.status] ?? quote.status}</Text>
            </View>
          </View>
        </View>

        {/* Drapeaux + date */}
        <View style={s.flagsRow}>
          <View style={s.flagItem}>
            <View style={quote.has_subsidy ? s.boxChecked : s.box} />
            <Text style={s.flagLabel}>Subvention</Text>
          </View>
          <View style={s.flagItem}>
            <View style={quote.will_call_back ? s.boxChecked : s.box} />
            <Text style={s.flagLabel}>Va nous rappeler</Text>
          </View>
          <View style={{ marginLeft: "auto", alignItems: "flex-end" }}>
            <Text style={s.dateLabel}>Date soumission</Text>
            <Text style={s.dateValue}>{quote.quote_date}</Text>
          </View>
        </View>

        {/* ── Client ─────────────────────────────────────────────── */}
        <View style={s.section}>
          <View style={s.sectionHeader}><Text style={s.sectionTitle}>Informations client</Text></View>
          <View style={s.sectionBody}>
            <View style={s.row2}>
              <View style={{ flex: 2 }}>
                <Text style={s.colLabel}>Nom</Text>
                <Text style={[s.colValue, { fontWeight: "bold" }]}>{quote.client_name}</Text>
              </View>
            </View>
            <View style={s.row2}>
              <Field label="Adresse domicile" value={quote.client_address} />
              <Field label="Adresse travaux" value={quote.client_work_address} />
            </View>
            <View style={s.row2}>
              <Field label="Téléphone" value={quote.client_phone} />
              <Field label="Cellulaire" value={quote.client_cell} />
              <Field label="Courriel" value={quote.client_email} />
            </View>
          </View>
        </View>

        {/* ── Unités ─────────────────────────────────────────────── */}
        {filledUnits.length > 0 && (
          <View style={s.section}>
            <View style={s.sectionHeader}><Text style={s.sectionTitle}>Équipements</Text></View>
            <View style={s.sectionBody}>
              {filledUnits.map((u, idx) => (
                <View key={u.id} wrap={false}>
                  {idx > 0 && <View style={s.unitSep} />}
                  <Text style={s.unitTitle}>
                    Unité {u.unit_order}
                    {u.brand || u.model ? `  —  ${[u.brand, u.model].filter(Boolean).join(" / ")}` : ""}
                  </Text>

                  {u.description && (
                    <View style={{ marginBottom: 4 }}>
                      <Text style={s.colLabel}>Description / Emplacement</Text>
                      <Text style={s.colValue}>{u.description}</Text>
                    </View>
                  )}

                  <View style={s.unitGrid}>
                    {u.capacity_btu && (
                      <View style={s.unitCell}><Field label="Capacité (BTU)" value={u.capacity_btu} /></View>
                    )}
                    {u.heating_capacity_25 && (
                      <View style={s.unitCell}><Field label="Cap. Chauf. -25°C" value={u.heating_capacity_25} /></View>
                    )}
                    {u.warranty_parts && (
                      <View style={s.unitCell}><Field label="Garantie pièces" value={u.warranty_parts} /></View>
                    )}
                    {u.warranty_months && (
                      <View style={s.unitCell}><Field label="Garantie M-O" value={u.warranty_months} /></View>
                    )}
                    {u.evaporator && (
                      <View style={s.unitCell}><Field label="Évaporateur" value={u.evaporator} /></View>
                    )}
                    {u.pipe_feet && (
                      <View style={s.unitCell}><Field label="Nbre pieds tuyaux" value={u.pipe_feet} /></View>
                    )}
                    {(u.cap_long1_length || u.cap_long1_color) && (
                      <View style={s.unitCellWide}>
                        <Text style={s.colLabel}>Cap Long 1</Text>
                        <Text style={s.colValue}>{[u.cap_long1_length, u.cap_long1_color].filter(Boolean).join(" — ")}</Text>
                      </View>
                    )}
                    {(u.cap_long2_length || u.cap_long2_color) && (
                      <View style={s.unitCellWide}>
                        <Text style={s.colLabel}>Cap Long 2</Text>
                        <Text style={s.colValue}>{[u.cap_long2_length, u.cap_long2_color].filter(Boolean).join(" — ")}</Text>
                      </View>
                    )}
                  </View>

                  <View style={s.row2}>
                    {u.support_type && (
                      <TagGroup
                        label="Support"
                        value={u.support_type}
                        options={Object.entries(SUPPORT_LABELS).map(([v, l]) => ({ v, l }))}
                      />
                    )}
                    {u.floor_mount_type && (
                      <TagGroup
                        label="Au sol"
                        value={u.floor_mount_type}
                        options={Object.entries(FLOOR_LABELS).map(([v, l]) => ({ v, l }))}
                      />
                    )}
                  </View>

                  <View style={[s.row2, { marginTop: 4 }]}>
                    {(u.unit_subtotal ?? 0) > 0 && (
                      <View style={s.col}>
                        <Text style={s.colLabel}>Total unité</Text>
                        <Text style={[s.colValue, { fontWeight: "bold", color: C.accent }]}>
                          {fmt(u.unit_subtotal ?? 0)} $
                        </Text>
                      </View>
                    )}
                    {u.serial_number && (
                      <View style={s.col}>
                        <Text style={s.colLabel}># Série</Text>
                        <Text style={s.colValue}>{u.serial_number}</Text>
                      </View>
                    )}
                  </View>
                </View>
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
              {(units[0]?.difficulty || units[0]?.tech_count) && (
                <View style={s.col}>
                  {units[0]?.difficulty && (
                    <>
                      <Text style={s.colLabel}>Niveau</Text>
                      <Text style={s.colValue}>{DIFF_LABELS[units[0].difficulty] ?? units[0].difficulty}</Text>
                    </>
                  )}
                </View>
              )}
              {units[0]?.tech_count && (
                <View style={s.col}>
                  <Text style={s.colLabel}>Techniciens</Text>
                  <Text style={s.colValue}>{units[0].tech_count} tech.</Text>
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
        {(quote.electrical_amperage || quote.electrical_panel || quote.electrical_included || quote.electrical_not_included || quote.electrical_to_schedule) && (
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

        {/* ── Financiers ─────────────────────────────────────────── */}
        <View style={s.section} wrap={false}>
          <View style={s.sectionHeader}><Text style={s.sectionTitle}>Financiers</Text></View>
          <View style={s.sectionBody}>
            <View style={s.row2}>
              {salespersonName && <Field label="Représentant" value={salespersonName} />}
              {quote.approved_by && <Field label="Approuvé par (client)" value={quote.approved_by} />}
            </View>
            <View style={{ marginTop: 6, maxWidth: 220, marginLeft: "auto" }}>
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
                {deposit != null && (
                  <View style={s.finRow}>
                    <Text style={s.finLabel}>Dépôt</Text>
                    <Text style={s.finValue}>{fmt(deposit)} $</Text>
                  </View>
                )}
                {montantSubv != null && (
                  <View style={s.finRow}>
                    <Text style={s.finLabel}>Montant subvention</Text>
                    <Text style={s.finValue}>{fmt(montantSubv)} $</Text>
                  </View>
                )}
                {totalNet != null && (
                  <View style={s.finRowGreen}>
                    <Text style={s.finLabelGreen}>Total net</Text>
                    <Text style={s.finValueGreen}>{fmt(totalNet)} $</Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        </View>

        {/* ── Signature ──────────────────────────────────────────── */}
        <View style={s.section} wrap={false}>
          <View style={s.sectionHeader}><Text style={s.sectionTitle}>Signature client</Text></View>
          <View style={s.sectionBody}>
            {quote.signature_data ? (
              <Image src={quote.signature_data} style={s.sigImage} />
            ) : (
              <View style={{ width: 200, height: 40, borderBottomWidth: 1, borderBottomColor: C.border, marginTop: 4 }}>
                <Text style={[s.colLabel, { paddingTop: 26 }]}>Signature</Text>
              </View>
            )}
            <Text style={s.sigNotice}>
              En acceptant cette soumission, le client s'engage à respecter les termes de paiement à l'installation.
            </Text>
          </View>
        </View>

      </Page>
    </Document>
  );
}
