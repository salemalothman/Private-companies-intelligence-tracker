"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { UpdatePasswordForm } from "@/components/auth/update-password-form";

/**
 * In-app password rotation for the signed-in user. Reuses the shared
 * UpdatePasswordForm with no redirect — on success the form closes the dialog.
 */
export function ChangePasswordDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-muted-foreground"
        >
          <KeyRound className="h-4 w-4" />
          Change password
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
          <DialogDescription>
            Set a new password for your account.
          </DialogDescription>
        </DialogHeader>

        <UpdatePasswordForm
          submitLabel="Update password"
          // Keep the dialog open briefly so the "Password updated." confirmation
          // is seen/announced before it auto-closes.
          onSuccess={() => window.setTimeout(() => setOpen(false), 1500)}
        />
      </DialogContent>
    </Dialog>
  );
}
