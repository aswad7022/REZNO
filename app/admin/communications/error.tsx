"use client";

export default function AdminCommunicationsError({
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <section className="rounded-xl border border-destructive/20 bg-background p-6">
      <h2 className="text-lg font-semibold">Communications reporting is temporarily unavailable.</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        The reporting request was rejected safely. Refresh the current scope and try again.
      </p>
      <button
        className="mt-4 rounded-md border px-4 py-2 text-sm font-medium"
        onClick={() => unstable_retry()}
        type="button"
      >
        Try again
      </button>
    </section>
  );
}
