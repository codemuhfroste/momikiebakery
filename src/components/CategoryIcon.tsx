// A colour and icon for each category, so groups in the Products and
// Inventory tables are recognisable at a glance (as Lingkod does per document
// type). The icon is picked from words in the name; the colour is fixed per
// name so a category always looks the same.

const COLORS = ["#6C63FF", "#2EC4B6", "#FF9F45", "#4C9AFF", "#B185FF", "#E5679A", "#3BB273", "#D4A62A"];

const ICONS: { words: RegExp; path: string }[] = [
  { words: /bread|pastr|bake|cake/i, path: "M5 11a5 3 0 0 1 14 0v7a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1zM9 13v3M12 13v3M15 13v3" },
  { words: /bever|drink|coffee|juice|water|milk/i, path: "M7 4h10l-1.5 15a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1zM7.5 9h9" },
  { words: /snack|chip|candy|biscuit|cracker/i, path: "M6 4h12l-1 4 1 4-1 4 1 4H6l1-4-1-4 1-4zM10 10h4M10 14h4" },
  { words: /can|sardine|meat/i, path: "M5 7c0-1.7 3.1-3 7-3s7 1.3 7 3v10c0 1.7-3.1 3-7 3s-7-1.3-7-3zM5 7c0 1.7 3.1 3 7 3s7-1.3 7-3" },
  { words: /noodle|pasta|instant/i, path: "M4 11h16a8 8 0 0 1-16 0zM8 11V4M12 11V3M16 11V4" },
  { words: /condiment|sauce|spice|sugar|oil|vinegar|salt/i, path: "M10 3h4v4l2 3v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10l2-3zM8 13h8" },
  { words: /house|soap|clean|deterg|laundry/i, path: "M4 11l8-7 8 7v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM10 21v-6h4v6" },
];
const DEFAULT_ICON = "M3 12V4h8l9 9-8 8zM7.5 7.5h.01";

export function categoryColor(name: string | null): string {
  if (!name) return "#94A3B8";
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return COLORS[Math.abs(hash) % COLORS.length];
}

export default function CategoryIcon({ name, className = "h-3.5 w-3.5" }: { name: string | null; className?: string }) {
  const path = (name && ICONS.find((i) => i.words.test(name))?.path) || DEFAULT_ICON;
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}
