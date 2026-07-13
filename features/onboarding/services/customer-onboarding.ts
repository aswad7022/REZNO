import "server-only";

import { prisma } from "@/lib/db/prisma";

type CustomerOnboardingDatabase = {
  person: {
    updateMany(args: {
      data: { isOnboarded: true };
      where: {
        authUserId: string;
        deletedAt: null;
        status: "ACTIVE";
      };
    }): Promise<{ count: number }>;
  };
};

export class CustomerOnboardingUnavailableError extends Error {
  constructor() {
    super("An active customer profile is required.");
    this.name = "CustomerOnboardingUnavailableError";
  }
}

export async function completeCustomerOnboardingProfile(
  authUserId: string,
  database: CustomerOnboardingDatabase = prisma,
) {
  const result = await database.person.updateMany({
    where: { authUserId, deletedAt: null, status: "ACTIVE" },
    data: { isOnboarded: true },
  });

  if (result.count !== 1) {
    throw new CustomerOnboardingUnavailableError();
  }

  return { isOnboarded: true as const };
}
