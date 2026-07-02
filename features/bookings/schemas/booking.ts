import { z } from "zod";

export const createBookingSchema = z.object({
  branchServiceId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startsAt: z.string().datetime(),
  memberId: z.union([z.string().uuid(), z.literal("")]).transform((value) =>
    value === "" ? null : value,
  ),
});

export const bookingStatusSchema = z.enum([
  "CONFIRMED",
  "CANCELLED",
  "COMPLETED",
  "NO_SHOW",
]);
