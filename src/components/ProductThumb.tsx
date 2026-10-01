import { productPhotoUrl } from "@/lib/types";

// A product's photo, or — if it has none — a tinted tile with its initials,
// so every product is recognisable at a glance. Colour comes from the name,
// so the same product always gets the same colour.
const TINTS = [
  "bg-amber-100 text-amber-800",
  "bg-sky-100 text-sky-800",
  "bg-emerald-100 text-emerald-800",
  "bg-rose-100 text-rose-800",
  "bg-violet-100 text-violet-800",
  "bg-orange-100 text-orange-800",
  "bg-teal-100 text-teal-800",
  "bg-slate-200 text-slate-700",
];

function initials(name: string) {
  const words = name.replace(/[^A-Za-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "?").slice(0, 2)).toUpperCase();
}

export default function ProductThumb({
  product,
  className = "h-10 w-10",
  textClass = "text-xs",
}: {
  product: { id: number; name: string; photo_version: string | null };
  className?: string;
  textClass?: string;
}) {
  const url = productPhotoUrl(product);
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- small pre-resized photos from our own API; next/image adds nothing here
      <img src={url} alt={product.name} loading="lazy" className={`shrink-0 rounded-md bg-white object-cover ${className}`} />
    );
  }
  let hash = 0;
  for (const ch of product.name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-md font-semibold ${TINTS[Math.abs(hash) % TINTS.length]} ${className} ${textClass}`}
    >
      {initials(product.name)}
    </span>
  );
}
