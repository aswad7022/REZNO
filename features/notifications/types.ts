export type DashboardNotificationStatus =
  | "PENDING"
  | "CONFIRMED"
  | "CANCELLED"
  | "COMPLETED"
  | "NO_SHOW";

export type DashboardNotification =
  | {
      id: string;
      status: DashboardNotificationStatus;
      serviceName: string;
      customerName: string;
      createdAt: string;
      href: string;
      kind: "BOOKING_STATUS" | "REVIEW_REQUEST" | "CHANGE_REQUEST";
      title?: never;
      body?: never;
      priority?: never;
    }
  | {
      id: string;
      serviceName: string;
      customerName: string;
      title: string;
      body: string;
      priority: "NORMAL" | "IMPORTANT";
      createdAt: string;
      href: string;
      kind: "ADMIN_ANNOUNCEMENT";
      status?: never;
    };
