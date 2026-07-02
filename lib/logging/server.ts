import "server-only";

export function logServerError(
  scope: string,
  error: unknown,
  context?: Record<string, string | number | boolean | null | undefined>,
) {
  console.error(`[rezno:${scope}]`, {
    ...context,
    error:
      error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : error,
  });
}
