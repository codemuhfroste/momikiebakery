// Remounts whenever the top-level section changes (e.g. Register → Transactions),
// so each page eases in. See node_modules/next/dist/docs/.../template.md.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-page-in">{children}</div>;
}
