import { requireActiveCommerceCustomer } from "@/features/commerce/services/authorization";
import { paymentCapabilities } from "@/features/payments/domain/capabilities";
import { paymentError } from "@/features/payments/domain/errors";
import { paymentProvider } from "@/features/payments/providers/registry";
import { prisma } from "@/lib/db/prisma";

export type CapabilityTarget =
  | { targetType: "CART"; targetId: string }
  | { targetType: "ORDER"; targetId: string }
  | { targetType: "BOOKING"; targetId: string };

export async function getCustomerPaymentCapabilities(
  customerPersonId: string,
  target?: CapabilityTarget,
) {
  await requireActiveCommerceCustomer(customerPersonId);
  if (!target) {
    return paymentCapabilities({ providerConfigured: paymentProvider().kind !== "NOT_CONFIGURED" });
  }
  let enabled: boolean;
  if (target.targetType === "CART") {
    const cart = await prisma.cart.findFirst({
      where: { customerId: customerPersonId, id: target.targetId, status: "ACTIVE" },
      select: { store: { select: { organization: { select: { settings: { select: { allowOnlinePayments: true } } } } } } },
    });
    if (!cart) paymentError("NOT_FOUND", "Cart was not found.");
    enabled = cart.store.organization.settings?.allowOnlinePayments ?? false;
  } else if (target.targetType === "ORDER") {
    const order = await prisma.order.findFirst({
      where: { customerId: customerPersonId, id: target.targetId },
      select: { store: { select: { organization: { select: { settings: { select: { allowOnlinePayments: true } } } } } } },
    });
    if (!order) paymentError("NOT_FOUND", "Order was not found.");
    enabled = order.store.organization.settings?.allowOnlinePayments ?? false;
  } else {
    const booking = await prisma.booking.findFirst({
      where: { customerId: customerPersonId, id: target.targetId },
      select: { organization: { select: { settings: { select: { allowOnlinePayments: true } } } } },
    });
    if (!booking) paymentError("NOT_FOUND", "Booking was not found.");
    enabled = booking.organization.settings?.allowOnlinePayments ?? false;
  }
  return paymentCapabilities({
    organizationOnlinePaymentsEnabled: enabled,
    providerConfigured: paymentProvider().kind !== "NOT_CONFIGURED",
  });
}
