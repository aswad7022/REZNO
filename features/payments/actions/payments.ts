"use server";

import { revalidatePath } from "next/cache";

import { requireAuthenticatedCommerceAdmin, requireAuthenticatedMerchantActor } from "@/features/commerce/services/authenticated-context";
import { paymentError } from "@/features/payments/domain/errors";
import { requestAdminRefund, requestBusinessRefund } from "@/features/payments/services/refunds";
import { runPaymentReconciliation } from "@/features/payments/services/reconciliation";
import { finalizeSettlement, previewSettlement } from "@/features/payments/services/settlements";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function requestBusinessRefundAction(formData: FormData) {
  const actor = await requireAuthenticatedMerchantActor();
  await requestBusinessRefund({
    contextOrganizationId: actor.organizationId,
    membershipId: actor.membershipId,
    personId: actor.personId,
  }, refundInput(formData));
  revalidatePath("/business/payments");
}

export async function requestAdminRefundAction(formData: FormData) {
  const context = await requireAuthenticatedCommerceAdmin("PAYMENTS_REFUND");
  await requestAdminRefund(context, refundInput(formData));
  revalidatePath("/admin/payments");
}

export async function previewSettlementAction(formData: FormData) {
  const context = await requireAuthenticatedCommerceAdmin("SETTLEMENTS_MANAGE");
  await previewSettlement(context, {
    currency: "IQD",
    idempotencyKey: uuidField(formData, "idempotencyKey"),
    organizationId: uuidField(formData, "organizationId"),
    periodEnd: dateField(formData, "periodEnd"),
    periodStart: dateField(formData, "periodStart"),
  });
  revalidatePath("/admin/payments/settlements");
}

export async function finalizeSettlementAction(formData: FormData) {
  const context = await requireAuthenticatedCommerceAdmin("SETTLEMENTS_MANAGE");
  const batchId = uuidField(formData, "batchId");
  await finalizeSettlement(context, batchId, {
    expectedVersion: integerField(formData, "expectedVersion"),
    idempotencyKey: uuidField(formData, "idempotencyKey"),
  });
  revalidatePath("/admin/payments/settlements");
}

export async function runReconciliationAction(formData: FormData) {
  const context = await requireAuthenticatedCommerceAdmin("PAYMENTS_RECONCILE");
  const organizationId = optionalUuidField(formData, "organizationId");
  const paymentIntentId = optionalUuidField(formData, "paymentIntentId");
  await runPaymentReconciliation(context, {
    idempotencyKey: uuidField(formData, "idempotencyKey"),
    limit: 25,
    organizationId,
    paymentIntentId,
  });
  revalidatePath("/admin/payments");
}

function refundInput(formData: FormData) {
  const reason = textField(formData, "reasonCode");
  if (!["CUSTOMER_REQUEST", "MERCHANT_CANCELLATION", "ADMIN_CORRECTION", "DUPLICATE_PAYMENT", "SERVICE_UNAVAILABLE", "OTHER"].includes(reason)) {
    paymentError("VALIDATION_ERROR", "Refund reason is invalid.");
  }
  const amount = textField(formData, "amount");
  if (!/^(?:0|[1-9][0-9]{0,14})(?:\.[0-9]{1,3})?$/.test(amount)) paymentError("VALIDATION_ERROR", "Refund amount is invalid.");
  return {
    amount,
    expectedVersion: integerField(formData, "expectedVersion"),
    idempotencyKey: uuidField(formData, "idempotencyKey"),
    note: optionalTextField(formData, "note", 500),
    paymentIntentId: uuidField(formData, "paymentIntentId"),
    reasonCode: reason as "CUSTOMER_REQUEST" | "MERCHANT_CANCELLATION" | "ADMIN_CORRECTION" | "DUPLICATE_PAYMENT" | "SERVICE_UNAVAILABLE" | "OTHER",
  };
}

function uuidField(formData: FormData, name: string) {
  const value = textField(formData, name);
  if (!UUID.test(value)) paymentError("VALIDATION_ERROR", name + " is invalid.");
  return value.toLowerCase();
}

function optionalUuidField(formData: FormData, name: string) {
  const value = optionalTextField(formData, name, 36);
  if (!value) return undefined;
  if (!UUID.test(value)) paymentError("VALIDATION_ERROR", name + " is invalid.");
  return value.toLowerCase();
}

function integerField(formData: FormData, name: string) {
  const value = Number(textField(formData, name));
  if (!Number.isSafeInteger(value) || value < 1) paymentError("VALIDATION_ERROR", name + " is invalid.");
  return value;
}

function dateField(formData: FormData, name: string) {
  const value = textField(formData, name);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) paymentError("VALIDATION_ERROR", name + " is invalid.");
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) paymentError("VALIDATION_ERROR", name + " is invalid.");
  return date;
}

function textField(formData: FormData, name: string) {
  const value = formData.get(name);
  if (typeof value !== "string" || !value.trim()) paymentError("VALIDATION_ERROR", name + " is required.");
  return value.trim();
}

function optionalTextField(formData: FormData, name: string, maximum: number) {
  const value = formData.get(name);
  if (value === null || value === "") return undefined;
  if (typeof value !== "string" || value.length > maximum) paymentError("VALIDATION_ERROR", name + " is invalid.");
  return value.trim() || undefined;
}
