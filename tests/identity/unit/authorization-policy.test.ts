import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveAdminGrant,
  resolvedAdminHasPermission,
  type AdminGrant,
} from "../../../features/admin/policies/admin-authorization";
import {
  canAccessOrganizationConversations,
  canManageOrganization,
  canOperateBookings,
  defaultCommercePermissionsForRole,
  hasCommercePermission,
  OWNER_DEFAULT_COMMERCE_PERMISSIONS,
} from "../../../features/identity/policies/authorization";
import { canAccessConversation } from "../../../features/messages/policies/conversation-access";

test("canonical organization and Commerce role defaults fail closed", () => {
  assert.equal(canManageOrganization("OWNER"), true);
  assert.equal(canManageOrganization("MANAGER"), true);
  assert.equal(canManageOrganization("RECEPTIONIST"), false);
  assert.equal(canOperateBookings("RECEPTIONIST"), true);
  assert.equal(canOperateBookings("STAFF"), false);
  assert.equal(canAccessOrganizationConversations("OWNER"), true);
  assert.equal(canAccessOrganizationConversations("MANAGER"), true);
  assert.equal(canAccessOrganizationConversations("RECEPTIONIST"), false);
  assert.equal(canAccessOrganizationConversations("STAFF"), false);

  assert.deepEqual(
    defaultCommercePermissionsForRole("OWNER"),
    OWNER_DEFAULT_COMMERCE_PERMISSIONS,
  );
  assert.deepEqual(defaultCommercePermissionsForRole("MANAGER"), []);
  assert.equal(new Set(OWNER_DEFAULT_COMMERCE_PERMISSIONS).size, 12);

  assert.equal(
    hasCommercePermission({
      commercePermissions: ["STORE_MANAGE"],
      permission: "STORE_MANAGE",
      systemRole: "STAFF",
    }),
    false,
    "owner-only Store lifecycle access cannot be delegated to Staff",
  );
  assert.equal(
    hasCommercePermission({
      commercePermissions: ["PRODUCT_CREATE"],
      permission: "PRODUCT_CREATE",
      systemRole: "STAFF",
    }),
    true,
    "non-owner Commerce capabilities require an explicit Role permission",
  );
  assert.equal(
    hasCommercePermission({
      commercePermissions: [],
      permission: "PRODUCT_CREATE",
      systemRole: "OWNER",
    }),
    false,
    "the stored Role permission remains explicit even for an Owner",
  );
});

test("admin grants support env and active DB sources while rejecting stale access", () => {
  const now = new Date("2026-07-14T12:00:00.000Z");
  const active = resolveAdminGrant({
    databaseAccess: {
      expiresAt: new Date("2026-07-15T12:00:00.000Z"),
      permissions: ["MESSAGES_VIEW"],
      role: "ADMIN",
      status: "ACTIVE",
    },
    envSuperAdmin: false,
    now,
  });
  assert.equal(active?.source, "database");
  assert.equal(resolvedAdminHasPermission(active, "MESSAGES_VIEW"), true);
  assert.equal(resolvedAdminHasPermission(active, "MESSAGES_SEND"), false);

  for (const databaseAccess of [
    { expiresAt: null, permissions: ["MESSAGES_VIEW"], role: "ADMIN", status: "REVOKED" },
    { expiresAt: null, permissions: ["MESSAGES_VIEW"], role: "ADMIN", status: "SUSPENDED" },
    {
      expiresAt: new Date("2026-07-14T11:59:59.000Z"),
      permissions: ["MESSAGES_VIEW"],
      role: "ADMIN",
      status: "ACTIVE",
    },
  ] satisfies AdminGrant[]) {
    assert.equal(
      resolveAdminGrant({ databaseAccess, envSuperAdmin: false, now }),
      null,
    );
  }

  assert.equal(
    resolveAdminGrant({ databaseAccess: null, envSuperAdmin: false, now }),
    null,
    "an arbitrary email without an env match or DB grant has no admin access",
  );
  const env = resolveAdminGrant({
    databaseAccess: null,
    envSuperAdmin: true,
    now,
  });
  assert.equal(env?.source, "env");
  assert.equal(resolvedAdminHasPermission(env, "MESSAGES_SEND"), true);
});

test("conversation access is participant-, tenant-, role-, and admin-scoped", () => {
  const adminConversation = {
    adminUserId: "admin-a",
    businessId: null,
    customerId: "customer-a",
    type: "ADMIN_USER" as const,
  };
  assert.equal(
    canAccessConversation(adminConversation, { kind: "admin", userId: "admin-a" }),
    true,
  );
  assert.equal(
    canAccessConversation(adminConversation, { kind: "admin", userId: "admin-b" }),
    false,
  );
  assert.equal(
    canAccessConversation(adminConversation, {
      kind: "customer",
      personId: "customer-a",
    }),
    true,
  );

  const businessConversation = {
    adminUserId: null,
    businessId: "org-a",
    customerId: "customer-a",
    type: "CUSTOMER_BUSINESS" as const,
  };
  assert.equal(
    canAccessConversation(businessConversation, {
      kind: "business",
      organizationId: "org-a",
      systemRole: "OWNER",
    }),
    true,
  );
  assert.equal(
    canAccessConversation(businessConversation, {
      kind: "business",
      organizationId: "org-b",
      systemRole: "OWNER",
    }),
    false,
  );
  assert.equal(
    canAccessConversation(businessConversation, {
      kind: "business",
      organizationId: "org-a",
      systemRole: "STAFF",
    }),
    false,
  );
  assert.equal(
    canAccessConversation(businessConversation, {
      kind: "admin",
      userId: "admin-a",
    }),
    false,
  );
});
