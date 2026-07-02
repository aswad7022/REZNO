import { z } from "zod";

type WorkingHoursValidationKey = "timeInvalid" | "timeRangeInvalid";
type WorkingHoursTranslator = (key: WorkingHoursValidationKey) => string;

export function createWorkingHoursSchema(t: WorkingHoursTranslator) {
  const time = z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, t("timeInvalid"));

  const day = z
    .object({
      dayOfWeek: z.number().int().min(0).max(6),
      isOpen: z.boolean(),
      openTime: time,
      closeTime: time,
    })
    .refine(
      (value) => !value.isOpen || value.openTime < value.closeTime,
      {
        message: t("timeRangeInvalid"),
        path: ["closeTime"],
      },
    );

  return z.object({
    days: z.array(day).length(7),
  });
}
