export function formatTaka(paisa: number | string): string {
  const value = Number(paisa ?? 0);
  return `৳${(value / 100).toFixed(2)}`;
}

export function statusLabel(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
