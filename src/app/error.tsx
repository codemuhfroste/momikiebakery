"use client";

import { useEffect, useState } from "react";
import ErrorPanel from "@/components/ErrorPanel";
import { Spinner, btnPrimary } from "@/components/ui";

// Shown inside the app (sidebar still there) when a page fails to load —
// most often a dropped connection to the database. Nothing that was already
// saved is lost; "Try again" re-loads just this page.
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const [retrying, setRetrying] = useState(false);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    console.error(error);
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, [error]);

  return (
    <ErrorPanel
      tone="error"
      title={offline ? "You're offline" : "This page couldn't load"}
      reference={error.digest}
      actions={
        <button
          type="button"
          className={btnPrimary}
          disabled={retrying}
          onClick={() => {
            setRetrying(true);
            retry();
            // retry() re-renders in place; drop the spinner if it fails again.
            setTimeout(() => setRetrying(false), 4000);
          }}
        >
          {retrying && <Spinner />}
          Try again
        </button>
      }
    >
      {offline ? (
        <p>This device has lost its internet connection. Reconnect to Wi-Fi or mobile data, then try again.</p>
      ) : (
        <p>
          Something went wrong while loading this page, usually a brief connection problem. Your saved sales and
          records are safe. Try again in a moment; if it keeps happening, note the reference below.
        </p>
      )}
    </ErrorPanel>
  );
}
