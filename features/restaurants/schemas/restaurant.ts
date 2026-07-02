import { z } from "zod";

const optionalText = z
  .string()
  .trim()
  .transform((value) => (value.length > 0 ? value : null));

export const restaurantTableSchema = z.object({
  branchId: optionalText,
  name: z.string().trim().min(1).max(120),
  code: optionalText,
  capacity: z.coerce.number().int().min(1).max(100),
  area: optionalText,
  floor: optionalText,
  positionLabel: optionalText,
  isActive: z.string().optional().transform((value) => value === "on"),
});

export const menuCategorySchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: optionalText,
  sortOrder: z.coerce.number().int().min(0).max(10_000),
  isActive: z.string().optional().transform((value) => value === "on"),
});

export const menuItemSchema = z.object({
  menuCategoryId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  description: optionalText,
  price: z.coerce.number().positive().max(999_999_999),
  currency: z.string().trim().min(3).max(3).default("IQD"),
  imageUrl: optionalText,
  isAvailable: z.string().optional().transform((value) => value === "on"),
  sortOrder: z.coerce.number().int().min(0).max(10_000),
  preparationMinutes: z
    .union([z.literal(""), z.coerce.number().int().min(1).max(1440)])
    .transform((value) => (value === "" ? null : value)),
});
