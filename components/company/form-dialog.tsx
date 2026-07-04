"use client";

import {
  cloneElement,
  isValidElement,
  useActionState,
  useEffect,
  useId,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { ActionResult } from "@/app/(app)/companies/actions";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

export function FormDialog({
  trigger,
  title,
  description,
  action,
  children,
  submitLabel = "Save",
  onSuccess,
}: {
  trigger: React.ReactNode;
  title: string;
  description?: string;
  action: (
    prev: ActionResult | undefined,
    formData: FormData,
  ) => Promise<ActionResult>;
  children: React.ReactNode;
  submitLabel?: string;
  onSuccess?: (state: ActionResult) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<ActionResult | undefined, FormData>(
    action,
    undefined,
  );

  useEffect(() => {
    if (state && !state.error) {
      setOpen(false);
      router.refresh();
      onSuccess?.(state);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          {children}
          {state?.error && (
            <p
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {state.error}
            </p>
          )}
          <DialogFooter>
            <Submit label={submitLabel} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Labeled field wrapper for dialog forms.
 *
 * Associates the label with its control: a generated `id` is cloned onto the
 * (single-element) child unless it already carries one, and the label gets the
 * matching `htmlFor` — so clicking a label focuses its input and screen
 * readers can pair them. Renders at full ink (`text-foreground`), not muted:
 * form structure must stay scannable in a data-entry-heavy app. */
export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const generatedId = useId();
  const child = isValidElement<{ id?: string }>(children) ? children : null;
  const id = child ? (child.props.id ?? generatedId) : undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      {child && child.props.id == null ? cloneElement(child, { id }) : children}
    </div>
  );
}
