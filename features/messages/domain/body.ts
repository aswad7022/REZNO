import { messageError } from "@/features/messages/domain/errors";

const INVALID_CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u;
const DATA_URL = /(^|[\s("'=])data:/iu;

export function normalizeMessageBody(input: unknown) {
  if (typeof input !== "string") invalid();
  const body = input.replace(/\r\n?/gu, "\n").trim();
  if (
    body.length === 0 ||
    Array.from(body).length > 1_000 ||
    INVALID_CONTROL.test(body) ||
    DATA_URL.test(body)
  ) {
    invalid();
  }
  return body;
}

function invalid(): never {
  return messageError(
    "VALIDATION_ERROR",
    "Message text must contain 1-1,000 safe characters.",
  );
}
