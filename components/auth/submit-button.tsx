"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

/**
 * Shared auth submit button. Reflects the enclosing form's pending state via
 * useFormStatus (so it MUST render inside a <form>): disabled + aria-busy while
 * the server action is in flight.
 */
export function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      className="w-full"
      disabled={pending}
      aria-busy={pending}
    >
      {pending ? "Please wait…" : label}
    </Button>
  );
}
