import "server-only";

import {
  validateCustomerPhone,
  type CustomerPhoneValidationCode,
} from "@/features/onboarding/services/customer-phone";
import { isMobileCustomerOnboardingComplete } from "@/features/onboarding/services/customer-onboarding-status";
import { prisma } from "@/lib/db/prisma";

type CustomerOnboardingPersonDatabase = {
  updateMany(args: {
    data: { isOnboarded: true; phone?: string };
    where: {
      authUserId: string;
      deletedAt: null;
      status: "ACTIVE";
    };
  }): Promise<{ count: number }>;
};

type CustomerOnboardingDatabase = {
  person: CustomerOnboardingPersonDatabase;
};

type MobileCustomerOnboardingDatabase = {
  person: CustomerOnboardingPersonDatabase & {
    findFirst(args: {
      select: { phone: true };
      where: {
        authUserId: string;
        deletedAt: null;
        status: "ACTIVE";
      };
    }): Promise<{ phone: string | null } | null>;
  };
};

type MobileCustomerOnboardingStatusDatabase = {
  person: {
    findFirst(args: {
      select: { isOnboarded: true; phone: true };
      where: {
        authUserId: string;
        deletedAt: null;
        status: "ACTIVE";
      };
    }): Promise<{ isOnboarded: boolean; phone: string | null } | null>;
  };
};

export class CustomerOnboardingUnavailableError extends Error {
  constructor() {
    super("An active customer profile is required.");
    this.name = "CustomerOnboardingUnavailableError";
  }
}

export class CustomerOnboardingPhoneError extends Error {
  constructor(readonly code: CustomerPhoneValidationCode) {
    super(
      code === "PHONE_REQUIRED"
        ? "A customer phone number is required."
        : "The customer phone number is invalid.",
    );
    this.name = "CustomerOnboardingPhoneError";
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

export async function completeMobileCustomerOnboardingProfile(
  authUserId: string,
  submittedPhone: unknown,
  database: MobileCustomerOnboardingDatabase = prisma,
) {
  const person = await database.person.findFirst({
    where: { authUserId, deletedAt: null, status: "ACTIVE" },
    select: { phone: true },
  });

  if (!person) {
    throw new CustomerOnboardingUnavailableError();
  }

  const phone = validateCustomerPhone(
    submittedPhone === undefined ? person.phone : submittedPhone,
  );
  if (!phone.ok) {
    throw new CustomerOnboardingPhoneError(phone.code);
  }

  const result = await database.person.updateMany({
    where: { authUserId, deletedAt: null, status: "ACTIVE" },
    data: { isOnboarded: true, phone: phone.value },
  });

  if (result.count !== 1) {
    throw new CustomerOnboardingUnavailableError();
  }

  return { isOnboarded: true as const };
}

export async function getMobileCustomerOnboardingStatus(
  authUserId: string,
  database: MobileCustomerOnboardingStatusDatabase = prisma,
) {
  const person = await database.person.findFirst({
    where: { authUserId, deletedAt: null, status: "ACTIVE" },
    select: { isOnboarded: true, phone: true },
  });
  if (!person) throw new CustomerOnboardingUnavailableError();

  return {
    isComplete: isMobileCustomerOnboardingComplete(person),
  };
}
