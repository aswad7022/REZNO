import type { BusinessVertical } from "@prisma/client";

export interface BusinessVerticalCapabilities {
  usesServices: boolean;
  usesEmployees: boolean;
  usesTables: boolean;
  usesMenu: boolean;
  services: boolean;
  employees: boolean;
  tables: boolean;
  menu: boolean;
  restaurantExperience: boolean;
  bookingLabelKey: "bookAppointment" | "reserveTable";
}

export const businessVerticals = [
  "BARBER",
  "BEAUTY",
  "CLINIC",
  "DENTIST",
  "SPA",
  "GYM",
  "CONSULTANT",
  "RESTAURANT",
  "CAFE",
  "OTHER",
] as const satisfies readonly BusinessVertical[];

export const businessVerticalCapabilities: Record<
  BusinessVertical,
  BusinessVerticalCapabilities
> = {
  BARBER: createCapabilities(true, true, false, false),
  BEAUTY: createCapabilities(true, true, false, false),
  CLINIC: createCapabilities(true, true, false, false),
  DENTIST: createCapabilities(true, true, false, false),
  SPA: createCapabilities(true, true, false, false),
  GYM: createCapabilities(true, true, false, false),
  CONSULTANT: createCapabilities(true, false, false, false),
  RESTAURANT: createCapabilities(false, false, true, true),
  CAFE: createCapabilities(false, false, true, true),
  OTHER: createCapabilities(true, true, false, false),
};

function createCapabilities(
  usesServices: boolean,
  usesEmployees: boolean,
  usesTables: boolean,
  usesMenu: boolean,
): BusinessVerticalCapabilities {
  return {
    usesServices,
    usesEmployees,
    usesTables,
    usesMenu,
    services: usesServices,
    employees: usesEmployees,
    tables: usesTables,
    menu: usesMenu,
    restaurantExperience: usesTables && usesMenu,
    bookingLabelKey: usesTables && usesMenu ? "reserveTable" : "bookAppointment",
  };
}

export function getBusinessVerticalCapabilities(vertical: BusinessVertical) {
  return businessVerticalCapabilities[vertical];
}

export function isRestaurantVertical(vertical: BusinessVertical): boolean {
  return businessVerticalCapabilities[vertical].restaurantExperience;
}
