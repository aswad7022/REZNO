import { z } from "zod";

import {
  BUSINESS_REPLY_MAX_LENGTH,
  REVIEW_COMMENT_MAX_LENGTH,
} from "@/features/reviews/domain/review-policy";

export const reviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  comment: z
    .string()
    .trim()
    .max(REVIEW_COMMENT_MAX_LENGTH)
    .transform((value) => value || null),
});

export const businessReplyFormSchema = z.object({
  reply: z.string().trim().min(1).max(BUSINESS_REPLY_MAX_LENGTH),
});
