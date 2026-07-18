export function bookingConversationIdentity(bookingId: string) {
  return `customer-business:booking:${bookingId}`;
}

export function generalConversationIdentity(
  businessId: string,
  customerId: string,
) {
  return `customer-business:general:${businessId}:${customerId}`;
}

export function adminUserConversationIdentity(
  adminUserId: string,
  customerId: string,
) {
  return `admin-user:${adminUserId}:${customerId}`;
}

export function adminBusinessConversationIdentity(
  adminUserId: string,
  businessId: string,
) {
  return `admin-business:${adminUserId}:${businessId}`;
}
