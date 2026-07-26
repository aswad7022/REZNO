import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import {
  setHostedCheckoutPolicyForTests,
} from "../../../features/payments/domain/hosted-checkout";
import { PaymentDomainError } from "../../../features/payments/domain/errors";
import {
  setHostedReturnSigningSecretForTests,
} from "../../../features/payments/domain/hosted-return-state";
import { DeterministicPaymentProvider } from "../../../features/payments/providers/deterministic";
import { setPaymentProviderForTests } from "../../../features/payments/providers/registry";
import {
  consumeCustomerHostedPaymentReturn,
  createCustomerHostedPaymentHandoff,
} from "../../../features/payments/services/hosted-payment";
import { createCustomerPaymentIntent } from "../../../features/payments/services/payment-intents";
import { prisma } from "../../../lib/db/prisma";
import {
  createPayableOrder,
  createPaymentFixture,
} from "../helpers/payment-fixture";

const CHECKOUT_ORIGIN = "https://checkout.rezno.example";

test(
  "Gate 7C hosted handoff is exact-origin, Person-scoped, one-use, and server-authoritative",
  { concurrency: false },
  async (t) => {
    const fixture = await createPaymentFixture("gate7c");
    const provider = new DeterministicPaymentProvider(
      "gate7c-integration-webhook-secret-strong",
    );
    provider.configureDefaultScenario("REQUIRES_ACTION");
    setPaymentProviderForTests(provider);
    setHostedReturnSigningSecretForTests(
      "Gate7C-Hosted-Integration-Signing-Secret-2026-Strong-Entropy",
    );
    setHostedCheckoutPolicyForTests({
      approvedOrigins: [CHECKOUT_ORIGIN],
      checkoutBaseUrl: `${CHECKOUT_ORIGIN}/session`,
      provider: "DETERMINISTIC_TEST",
    });
    t.after(async () => {
      setHostedCheckoutPolicyForTests(undefined);
      setHostedReturnSigningSecretForTests(undefined);
      setPaymentProviderForTests(null);
      await prisma.$disconnect();
    });

    const order = await createPayableOrder({
      customerId: fixture.customer.person.id,
      storeId: fixture.store.id,
    });
    const payment = await createCustomerPaymentIntent(
      fixture.customer.person.id,
      {
        idempotencyKey: randomUUID(),
        targetId: order.id,
        targetType: "ORDER",
      },
    );
    assert.equal(payment.status, "REQUIRES_ACTION");

    const key = randomUUID();
    const handoff = await createCustomerHostedPaymentHandoff(
      fixture.customer.person.id,
      payment.id,
      key,
    );
    const replayedHandoff = await createCustomerHostedPaymentHandoff(
      fixture.customer.person.id,
      payment.id,
      key,
    );
    assert.deepEqual(replayedHandoff, handoff);
    const checkout = new URL(handoff.checkoutUrl);
    assert.equal(checkout.origin, CHECKOUT_ORIGIN);
    assert.equal(checkout.pathname, "/session");
    assert.equal(checkout.searchParams.get("state"), handoff.state);
    assert.equal(
      new URL(handoff.returnUrls.success).protocol,
      "rezno:",
    );
    assert.equal(
      new URL(handoff.returnUrls.success).searchParams.get("outcome"),
      "success",
    );
    assert.doesNotMatch(
      JSON.stringify(handoff),
      /cookie|authorization|BETTER_AUTH_SECRET|providerReference|customerPersonId/i,
    );
    assert.equal(
      await prisma.paymentMutation.count({
        where: {
          actorPersonId: fixture.customer.person.id,
          paymentIntentId: payment.id,
          action: "RUN_RECONCILIATION",
        },
      }),
      1,
    );

    await assert.rejects(
      consumeCustomerHostedPaymentReturn(
        fixture.actors.foreignCustomer.personId,
        payment.id,
        handoff.state,
      ),
      paymentCode("VALIDATION_ERROR"),
    );
    const consumed = await consumeCustomerHostedPaymentReturn(
      fixture.customer.person.id,
      payment.id,
      handoff.state,
    );
    // A return link is never financial proof: the provider/webhook remains the
    // only path that can advance the authoritative intent.
    assert.equal(consumed.status, "REQUIRES_ACTION");
    assert.equal(
      (
        await prisma.paymentMutation.findFirstOrThrow({
          where: {
            actorPersonId: fixture.customer.person.id,
            paymentIntentId: payment.id,
            action: "RUN_RECONCILIATION",
          },
        })
      ).status,
      "COMPLETED",
    );
    await assert.rejects(
      consumeCustomerHostedPaymentReturn(
        fixture.customer.person.id,
        payment.id,
        handoff.state,
      ),
      paymentCode("PAYMENT_STATE_CONFLICT"),
    );

    const otherOrder = await createPayableOrder({
      customerId: fixture.customer.person.id,
      storeId: fixture.store.id,
    });
    const otherPayment = await createCustomerPaymentIntent(
      fixture.customer.person.id,
      {
        idempotencyKey: randomUUID(),
        targetId: otherOrder.id,
        targetType: "ORDER",
      },
    );
    await assert.rejects(
      consumeCustomerHostedPaymentReturn(
        fixture.customer.person.id,
        otherPayment.id,
        handoff.state,
      ),
      paymentCode("VALIDATION_ERROR"),
    );

    setHostedCheckoutPolicyForTests(null);
    await assert.rejects(
      createCustomerHostedPaymentHandoff(
        fixture.customer.person.id,
        otherPayment.id,
        randomUUID(),
      ),
      paymentCode("PAYMENT_PROVIDER_NOT_CONFIGURED"),
    );
    assert.equal(
      await prisma.paymentMutation.count({
        where: {
          paymentIntentId: otherPayment.id,
          action: "RUN_RECONCILIATION",
        },
      }),
      0,
    );
  },
);

function paymentCode(expected: string) {
  return (error: unknown) =>
    error instanceof PaymentDomainError && error.code === expected;
}
