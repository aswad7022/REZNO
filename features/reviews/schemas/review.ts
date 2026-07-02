import { z } from "zod";

export const reviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  comment: z
    .string()
    .trim()
    .max(1000)
    .transform((value) => value || null),
});
