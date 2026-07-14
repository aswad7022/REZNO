import { validateCustomerPhone } from "@/features/onboarding/services/customer-phone";

export function isMobileCustomerOnboardingComplete(person: {
  isOnboarded: boolean;
  phone: string | null;
}): boolean {
  return person.isOnboarded && validateCustomerPhone(person.phone).ok;
}
