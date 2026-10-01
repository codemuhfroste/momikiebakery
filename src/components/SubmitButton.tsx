"use client";

import { useFormStatus } from "react-dom";
import { Spinner } from "./ui";

// A submit button that shows a spinner while its form's server action runs.
// For plain <form action={serverAction}> forms that don't use useActionState.
export default function SubmitButton({
  children,
  pendingLabel,
  className,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? (
        <>
          <Spinner /> {pendingLabel ?? children}
        </>
      ) : (
        children
      )}
    </button>
  );
}
