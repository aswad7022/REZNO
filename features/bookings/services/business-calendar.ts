import "server-only";

import {
  listOperationalCalendar,
  type OperationalCalendarData,
  type OperationalCalendarSearchParams,
} from "@/features/business-operations/services/daily-calendar";
import { currentBusinessOperationReference } from "@/features/business-operations/services/identity-adapter";

export type BusinessCalendarSearchParams = OperationalCalendarSearchParams;
export type BusinessCalendarData = OperationalCalendarData;
export type {
  OperationalCalendarItem as BusinessCalendarBookingItem,
  StaffSelfCalendarItem as StaffSelfCalendarBookingItem,
} from "@/features/business-operations/services/daily-calendar";

export async function getBusinessCalendarData(
  params: BusinessCalendarSearchParams,
): Promise<BusinessCalendarData> {
  return listOperationalCalendar(
    await currentBusinessOperationReference("BOOKING_READ"),
    params,
  );
}
