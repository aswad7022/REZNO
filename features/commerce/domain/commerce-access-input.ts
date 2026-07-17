import { z } from "zod";

import { COMMERCE_PERMISSIONS } from "@/features/commerce/domain/merchant-access";

const commercePermissionSchema = z.enum(COMMERCE_PERMISSIONS);

export const updateCommerceRolePermissionsSchema = z.object({
  contextOrganizationId: z.string().uuid(),
  expectedVersion: z.string().datetime({ offset: true }),
  idempotencyKey: z.string().uuid(),
  permissions: z.array(commercePermissionSchema).max(COMMERCE_PERMISSIONS.length),
  roleId: z.string().uuid(),
}).strict().transform((value) => ({
  ...value,
  permissions: COMMERCE_PERMISSIONS.filter((permission) => value.permissions.includes(permission)),
}));

export type UpdateCommerceRolePermissionsInput = z.input<typeof updateCommerceRolePermissionsSchema>;
