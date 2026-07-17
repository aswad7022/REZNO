import "dotenv/config";

import { expireAllEligiblePendingOrders } from "../../features/commerce/services/expiration-service";
import { validateCommerceExpirationEnvironment } from "./expiration-safety";

async function main() {
  validateCommerceExpirationEnvironment(process.env);
  const result = await expireAllEligiblePendingOrders();
  process.stdout.write(`Expired ${result.expired} pending commerce Orders in ${result.batches} batch(es).\n`);
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown expiration failure.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
