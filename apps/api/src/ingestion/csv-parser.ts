export interface ParsedCsv {
  headers: string[];
  rows: Array<Record<string, string>>;
}

const normalizeHeader = (header: string): string => {
  return header.trim().toLowerCase();
};

export const parseCsv = (content: string): ParsedCsv => {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = lines[0].split(",").map((header) => normalizeHeader(header));

  const rows = lines.slice(1).map((line) => {
    const values = line.split(",").map((value) => value.trim());
    const row: Record<string, string> = {};

    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });

    return row;
  });

  return { headers, rows };
};
