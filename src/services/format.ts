import { CHARACTER_LIMIT } from "../constants.js";

export function truncateText(text: string, limit: number = CHARACTER_LIMIT): string {
  if (text.length <= limit) return text;
  return (
    text.slice(0, limit) +
    `\n\n[...truncated — output exceeded ${limit} characters. Narrow your request (e.g. fewer periods, a lower limit, or a more specific query) for the full data.]`
  );
}

export function markdownTable(headers: string[], rows: string[][]): string {
  if (rows.length === 0) return "_No rows returned._";
  const headerLine = `| ${headers.join(" | ")} |`;
  const sepLine = `| ${headers.map(() => "---").join(" | ")} |`;
  const rowLines = rows.map((r) => `| ${r.map((c) => c.replace(/\|/g, "\\|") || "—").join(" | ")} |`);
  return [headerLine, sepLine, ...rowLines].join("\n");
}
