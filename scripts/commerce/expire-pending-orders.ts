import "dotenv/config";

import { expireAllEligiblePendingOrders } from "../../features/commerce/services/expiration-service";

const REQUIRED_CONFIRMATION = "EXPIRE_PENDING_COMMERCE_ORDERS";

async function main() {
  if (process.env.COMMERCE_EXPIRATION_CONFIRM !== REQUIRED_CONFIRMATION) {
    throw new Error(
      `Refusing to run. Set COMMERCE_EXPIRATION_CONFIRM=${REQUIRED_CONFIRMATION} for the intended database.`,
    );
  }
  const result = await expireAllEligiblePendingOrders();
  process.stdout.write(`Expired ${result.expired} pending commerce Orders in ${result.batches} batch(es).\n`);
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown expiration failure.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
