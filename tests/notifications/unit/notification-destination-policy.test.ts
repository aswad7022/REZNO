import assert from "node:assert/strict";
import test from "node:test";

import type { CommercePermission, SystemRole } from "@prisma/client";

import {
  canAccessBusinessCommerceOrderDestination,
  canAccessBusinessMessagesDestination,
} from "../../../features/notifications/domain/destination-policy";
import type { NotificationActorContext } from "../../../features/notifications/domain/contracts";

function actor(systemRole: SystemRole, effectiveCommercePermissions: CommercePermission[]): Extract<NotificationActorContext, { mode: "business" }> {
  return {
    effectiveCommercePermissions,
    membershipId: "11111111-1111-4111-8111-111111111111",
    mode: "business",
    organizationId: "22222222-2222-4222-8222-222222222222",
    personId: "33333333-3333-4333-8333-333333333333",
    restaurant: false,
    roleId: "44444444-4444-4444-8444-444444444444",
    systemRole,
  };
}

test("Commerce notification destinations require effective ORDER_VIEW", () => {
  assert.equal(canAccessBusinessCommerceOrderDestination(actor("OWNER", ["ORDER_VIEW"])), true);
  assert.equal(canAccessBusinessCommerceOrderDestination(actor("MANAGER", ["ORDER_VIEW"])), true);
  assert.equal(canAccessBusinessCommerceOrderDestination(actor("STAFF", ["ORDER_VIEW"])), true);
  assert.equal(canAccessBusinessCommerceOrderDestination(actor("STAFF", ["ORDER_MANAGE"])), false);
  assert.equal(canAccessBusinessCommerceOrderDestination(actor("RECEPTIONIST", [])), false);
});

test("Business Messages notification destinations follow the canonical Messaging role policy", () => {
  assert.equal(canAccessBusinessMessagesDestination(actor("OWNER", [])), true);
  assert.equal(canAccessBusinessMessagesDestination(actor("MANAGER", [])), true);
  assert.equal(canAccessBusinessMessagesDestination(actor("RECEPTIONIST", [])), false);
  assert.equal(canAccessBusinessMessagesDestination(actor("STAFF", [])), false);
});
