import "server-only";

import type { NextRequest } from "next/server";
import { z } from "zod";

import {
  businessReplyInputSchema,
  MAX_PUBLIC_REVIEW_PAGE_SIZE,
  reviewInputSchema,
} from "@/features/reviews/domain/review-policy";
import { reviewDomainError } from "@/features/reviews/domain/errors";

async function readStrictJson(request: NextRequest) {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    reviewDomainError("INVALID_REQUEST", "Content-Type must be application/json.");
  }
  try {
    return await request.json();
  } catch {
    reviewDomainError("INVALID_REQUEST", "Request body must be valid JSON.");
  }
}

export async function parseCustomerReviewRequest(request: NextRequest) {
  const parsed = reviewInputSchema.safeParse(await readStrictJson(request));
  if (!parsed.success) {
    reviewDomainError("INVALID_REQUEST", "Review payload is invalid.");
  }
  return parsed.data;
}

export async function parseBusinessReplyRequest(request: NextRequest) {
  const parsed = businessReplyInputSchema.safeParse(await readStrictJson(request));
  if (!parsed.success) {
    reviewDomainError("INVALID_REQUEST", "Business reply payload is invalid.");
  }
  return parsed.data;
}

const publicQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PUBLIC_REVIEW_PAGE_SIZE).optional(),
}).strict();

export function parsePublicReviewQuery(searchParams: URLSearchParams) {
  for (const key of searchParams.keys()) {
    if (searchParams.getAll(key).length !== 1) {
      reviewDomainError("INVALID_REQUEST", "Review query is invalid.");
    }
  }
  const values = Object.fromEntries(searchParams);
  const parsed = publicQuerySchema.safeParse(values);
  if (!parsed.success) {
    reviewDomainError("INVALID_REQUEST", "Review query is invalid.");
  }
  return parsed.data;
}
