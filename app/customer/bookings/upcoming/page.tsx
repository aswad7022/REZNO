import { CustomerBookingsPage } from "@/features/bookings/components/customer-bookings-page";

export default function UpcomingBookingsRoute() {
  return <CustomerBookingsPage filter="upcoming" />;
}
