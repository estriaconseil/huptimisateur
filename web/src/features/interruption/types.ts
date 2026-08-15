/** Types partagés — PDF / run Interruption */

export type BackupSalesRow = {
  date: string;
  time: string;
  salespersonName: string;
  clientName: string;
  phone: string;
  address: string;
  statusLabel: string;
  quoteNumber: string;
  isBlock?: boolean;
};

export type BackupInstallRow = {
  date: string;
  slotLabel: string;
  teamName: string;
  clientName: string;
  phone: string;
  address: string;
  durationLabel: string;
  notes: string;
  quoteNumber: string;
  isBlock?: boolean;
};

export type BackupPayload = {
  generatedAtIso: string;
  periodStart: string;
  periodEnd: string;
  week1Label: string;
  week2Label: string;
  salesByDate: Record<string, BackupSalesRow[]>;
  installByDate: Record<string, BackupInstallRow[]>;
  salesEmpty: boolean;
  installEmpty: boolean;
};
