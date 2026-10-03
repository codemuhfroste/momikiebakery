"use client";

// Last-resort screen when the app's outer frame itself fails (e.g. the
// database is unreachable while checking who is signed in). It replaces the
// whole page and gets none of the app's stylesheet, so it is styled inline.
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#f3f5f9",
          color: "#0f172a",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          padding: 16,
        }}
      >
        <title>Momikie&apos;s POS — something went wrong</title>
        <div
          style={{
            maxWidth: 420,
            width: "100%",
            background: "#fff",
            border: "1px solid #e1e6ee",
            borderRadius: 12,
            padding: 32,
            textAlign: "center",
            boxShadow: "0 1px 2px rgba(0,0,0,.05)",
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              margin: "0 auto",
              borderRadius: 8,
              background: "#d4a62a",
              color: "#0f1d3d",
              display: "grid",
              placeItems: "center",
              fontFamily: "Georgia, serif",
              fontWeight: 700,
              fontSize: 22,
            }}
          >
            M
          </div>
          <h1 style={{ fontSize: 20, margin: "16px 0 8px" }}>Momikie&apos;s POS couldn&apos;t load</h1>
          <p style={{ fontSize: 14, color: "#5b6577", lineHeight: 1.5, margin: 0 }}>
            The system couldn&apos;t reach its database, usually a brief connection problem. Saved sales and records
            are safe. Check the internet connection, then try again.
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 24, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => retry()}
              style={{
                background: "#1d3a8a",
                color: "#fff",
                border: 0,
                borderRadius: 6,
                padding: "10px 18px",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            <a
              href="/login"
              style={{
                border: "1px solid #e1e6ee",
                borderRadius: 6,
                padding: "10px 18px",
                fontSize: 14,
                color: "#0f172a",
                textDecoration: "none",
              }}
            >
              Back to sign in
            </a>
          </div>
          {error.digest && (
            <p style={{ marginTop: 24, fontSize: 12, color: "#94a3b8" }}>
              Reference: <span style={{ fontFamily: "monospace" }}>{error.digest}</span>
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
