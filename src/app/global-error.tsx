"use client";

/** The last resort, when even the app's frame failed: plain HTML, no styles to depend on. */
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100dvh" }}>
        <div role="alert" style={{ maxWidth: 360, padding: 16, textAlign: "center" }}>
          <h1 style={{ fontSize: 20 }}>Fowlex didn&apos;t load</h1>
          <p style={{ color: "#555" }}>Check your connection, then try again.</p>
          <button type="button" onClick={() => retry()} style={{ minHeight: 44, padding: "0 20px", fontSize: 16 }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
