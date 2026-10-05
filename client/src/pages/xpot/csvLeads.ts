// Prospects imported from a CSV export (Google Maps scrapers, spreadsheets).

export type CsvLeadRow = {
  name: string;
  phone: string;
  email: string;
  website: string;
  industry: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
};

/** Header row first; common column names are accepted. Rows without a name are dropped. */
export function parseCsvText(text: string): CsvLeadRow[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z_]/g, ""));
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] || ""; });
    return {
      name: row["name"] || row["business_name"] || row["company"] || "",
      phone: row["phone"] || row["phone_number"] || "",
      email: row["email"] || "",
      website: row["website"] || row["url"] || "",
      industry: row["industry"] || row["type"] || row["category"] || "",
      addressLine1: row["address"] || row["address_line_1"] || row["street"] || "",
      city: row["city"] || "",
      state: row["state"] || "",
      postalCode: row["postal_code"] || row["zip"] || row["zip_code"] || "",
    };
  }).filter((r) => r.name.length > 0);
}
