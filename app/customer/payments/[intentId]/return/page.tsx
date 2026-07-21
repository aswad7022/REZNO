import { redirect } from "next/navigation";

import { paymentId } from "@/features/payments/api/validation";

export default async function CustomerPaymentReturnPage({ params }: { params: Promise<{ intentId: string }> }) {
  const intentId = paymentId((await params).intentId, "intentId");
  redirect(`/customer/payments/${intentId}`);
}
