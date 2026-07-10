import { AuthForm } from "@/components/auth/auth-form";

/**
 * Recovery-flow error codes (set by /auth/confirm and /reset-password on a
 * missing/expired/failed reset link) mapped to a human message shown on the
 * login form. Unknown codes render nothing.
 */
const RECOVERY_ERRORS: Record<string, string> = {
  "invalid-link":
    "That password-reset link is invalid or incomplete. Request a new one below.",
  "recovery-failed":
    "That password-reset link has expired or was already used. Request a new one below.",
  "recovery-expired":
    "Your reset session expired before you set a new password. Request a new link below.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const recoveryError = error ? RECOVERY_ERRORS[error] : undefined;
  return <AuthForm mode="login" recoveryError={recoveryError} />;
}
