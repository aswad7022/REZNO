import { randomUUID } from "node:crypto";
import Link from "next/link";
import { Phone, Star } from "lucide-react";

import { getAvailableTransitions } from "@/features/bookings/policies/booking-lifecycle";
import {
  cancelCustomerBooking,
  respondToBookingChange,
} from "@/features/bookings/actions/manage-bookings";
import {
  BookingTransitionForm,
  CustomerChangeRequestResponseForm,
} from "@/features/business-operations/components/daily-operation-forms";
import { openBookingConversation } from "@/features/messages/actions/messages";
import type { BookingListItem } from "@/features/bookings/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReviewForm } from "@/features/reviews/components/review-form";

export function BookingCard({
  booking,
  formattedRange,
  formattedPendingChange,
  labels,
  audience,
  canOperate = false,
  showDetailsLink = true,
}: {
  booking: BookingListItem;
  formattedRange: string;
  formattedPendingChange?: string;
  labels: {
    status: string;
    customer: string;
    staff: string;
    automaticStaff: string;
    cancel: string;
    reschedule: string;
    business: string;
    price: string;
    contact: string;
    viewDetails: string;
    messageBusiness: string;
    messageCustomer: string;
    table: string;
    guests: string;
    preorder: string;
    reviewSubmitted: string;
    proposeChange: string;
    changeRequested: string;
    acceptChange: string;
    rejectChange: string;
    pendingChangeStaff: string;
    waitingForCustomer: string;
    waitingForBusiness: string;
    transitions: Record<"CONFIRMED" | "CANCELLED" | "COMPLETED" | "NO_SHOW", string>;
  };
  audience: "customer" | "business";
  canOperate?: boolean;
  showDetailsLink?: boolean;
}) {
  const transitions = getAvailableTransitions(booking.status);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>{booking.serviceName}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {booking.branchName}
          </p>
        </div>
        <Badge
          variant={
            booking.status === "CANCELLED" || booking.status === "NO_SHOW"
              ? "destructive"
              : booking.status === "COMPLETED"
                ? "secondary"
                : "default"
          }
        >
          {labels.status}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="font-medium">{formattedRange}</p>
        {audience === "business" ? (
          <p>
            <span className="text-muted-foreground">{labels.customer}: </span>
            {booking.customerName}
          </p>
        ) : null}
        {audience === "customer" ? (
          <p>
            <span className="text-muted-foreground">{labels.business}: </span>
            {booking.businessName}
          </p>
        ) : null}
        {audience === "customer" && booking.canCustomerReview ? (
          <ReviewForm bookingId={booking.id} />
        ) : null}
        {audience === "customer" && booking.review ? (
          <div className="rounded-xl bg-muted/60 p-4">
            <p className="flex items-center gap-2 font-medium">
              <Star className="size-4 fill-amber-400 text-amber-500" />
              {labels.reviewSubmitted} · {booking.review.rating}/5
            </p>
            {booking.review.comment ? (
              <p className="mt-2 text-muted-foreground">
                {booking.review.comment}
              </p>
            ) : null}
          </div>
        ) : null}
        {audience === "customer" &&
        booking.pendingChange &&
        formattedPendingChange ? (
          <div className="space-y-3 rounded-xl border border-indigo-300/60 bg-indigo-50/70 p-4 dark:bg-indigo-950/20">
            <div>
              <p className="font-semibold">{labels.changeRequested}</p>
              <p className="mt-1">{formattedPendingChange}</p>
              {booking.pendingChange.memberName ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {labels.pendingChangeStaff}: {booking.pendingChange.memberName}
                </p>
              ) : null}
            </div>
            {booking.pendingChange.requestedByCustomer ? (
              <p className="text-xs font-medium text-muted-foreground">
                {labels.waitingForBusiness}
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                <form action={respondToBookingChange.bind(null, booking.pendingChange.id)}>
                  <input type="hidden" name="decision" value="accept" />
                  <Button size="sm" type="submit">{labels.acceptChange}</Button>
                </form>
                <form action={respondToBookingChange.bind(null, booking.pendingChange.id)}>
                  <input type="hidden" name="decision" value="reject" />
                  <Button size="sm" type="submit" variant="outline">
                    {labels.rejectChange}
                  </Button>
                </form>
              </div>
            )}
          </div>
        ) : null}
        {audience === "business" &&
        booking.pendingChange &&
        booking.pendingChange.requestedByCustomer &&
        formattedPendingChange ? (
          <div className="space-y-3 rounded-xl border border-indigo-300/60 bg-indigo-50/70 p-4 dark:bg-indigo-950/20">
            <p className="font-semibold">{labels.changeRequested}</p>
            <p>{formattedPendingChange}</p>
            <div className="flex flex-wrap gap-2">
              <CustomerChangeRequestResponseForm
                contextOrganizationId={booking.organizationId}
                decision="accept"
                expectedBookingVersion={booking.version}
                expectedRequestCreatedAt={booking.pendingChange.createdAt}
                idempotencyKey={randomUUID()}
                label={labels.acceptChange}
                requestId={booking.pendingChange.id}
              />
              <CustomerChangeRequestResponseForm
                contextOrganizationId={booking.organizationId}
                decision="reject"
                expectedBookingVersion={booking.version}
                expectedRequestCreatedAt={booking.pendingChange.createdAt}
                idempotencyKey={randomUUID()}
                label={labels.rejectChange}
                requestId={booking.pendingChange.id}
              />
            </div>
          </div>
        ) : null}
        {audience === "business" &&
        booking.pendingChange &&
        !booking.pendingChange.requestedByCustomer ? (
          <p className="rounded-lg bg-indigo-500/10 p-3 text-sm font-medium text-indigo-700 dark:text-indigo-300">
            {labels.waitingForCustomer}
          </p>
        ) : null}
        {booking.restaurantReservation ? (
          <div className="rounded-xl border bg-muted/30 p-3">
            <p>
              <span className="text-muted-foreground">{labels.table}: </span>
              {booking.restaurantReservation.tableName}
              {booking.restaurantReservation.seatingArea
                ? ` · ${booking.restaurantReservation.seatingArea}`
                : ""}
            </p>
            <p className="mt-1">
              <span className="text-muted-foreground">{labels.guests}: </span>
              {booking.restaurantReservation.guestCount}
            </p>
            {booking.restaurantReservation.items.length > 0 ? (
              <div className="mt-2 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">{labels.preorder}</p>
                {booking.restaurantReservation.items.map((item) => (
                  <p key={item.name}>
                    {item.quantity}× {item.name}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <p>
            <span className="text-muted-foreground">{labels.staff}: </span>
            {booking.memberName ?? labels.automaticStaff}
          </p>
        )}
        <p>
          <span className="text-muted-foreground">{labels.price}: </span>
          {booking.price}
        </p>
        {audience === "customer" && booking.contactPhone ? (
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <a href={`tel:${booking.contactPhone}`}>
                <Phone className="size-4" />
                {labels.contact}
              </a>
            </Button>
            <form action={openBookingConversation.bind(null, "customer", booking.id)}>
              <Button size="sm" variant="outline" type="submit">
                {labels.messageBusiness}
              </Button>
            </form>
          </div>
        ) : null}
        {audience === "customer" && !booking.contactPhone ? (
          <form action={openBookingConversation.bind(null, "customer", booking.id)}>
            <Button size="sm" variant="outline" type="submit">
              {labels.messageBusiness}
            </Button>
          </form>
        ) : null}
        {audience === "customer" ? (
          <div className="flex flex-wrap gap-2 pt-1">
            {showDetailsLink ? (
              <Button asChild size="sm" variant="outline">
                <Link href={`/customer/bookings/${booking.id}`}>
                  {labels.viewDetails}
                </Link>
              </Button>
            ) : null}
            {booking.canCustomerReschedule ? (
              <Button asChild size="sm" variant="outline">
                <Link href={`/customer/bookings/${booking.id}/reschedule`}>
                  {labels.reschedule}
                </Link>
              </Button>
            ) : null}
            {booking.canCustomerCancel ? (
              <form action={cancelCustomerBooking.bind(null, booking.id)}>
                <Button type="submit" variant="destructive" size="sm">
                  {labels.cancel}
                </Button>
              </form>
            ) : null}
          </div>
        ) : null}
        {audience === "business" && canOperate ? (
          <form action={openBookingConversation.bind(null, "business", booking.id)}>
            <Button size="sm" variant="outline" type="submit">
              {labels.messageCustomer}
            </Button>
          </form>
        ) : null}
        {audience === "business" && canOperate && transitions.length > 0 ? (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button asChild size="sm" variant="outline">
              <Link href={`/business/bookings/${booking.id}/reschedule`}>
                {labels.proposeChange}
              </Link>
            </Button>
            {transitions.map((status) => (
              <BookingTransitionForm
                key={status}
                bookingId={booking.id}
                contextOrganizationId={booking.organizationId}
                expectedVersion={booking.version}
                idempotencyKey={randomUUID()}
                label={labels.transitions[status]}
                nextStatus={status}
              />
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
