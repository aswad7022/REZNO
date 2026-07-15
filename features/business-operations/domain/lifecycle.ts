export interface BranchArchiveRelationships {
  activeAssignments: number;
  activeOfferings: number;
  activeTables: number;
  genericBookings: number;
  restaurantReservations: number;
  total: number;
}

export function branchArchiveConflicts(input: BranchArchiveRelationships) {
  return Object.entries(input)
    .filter(([, count]) => count > 0)
    .map(([relationship]) => relationship);
}

export function requiresReservationImpactConfirmation(input: { total: number }) {
  return input.total > 0;
}

export function intervalsOverlap(
  left: { endsAt: Date; startsAt: Date },
  right: { endsAt: Date; startsAt: Date },
) {
  return left.startsAt < right.endsAt && left.endsAt > right.startsAt;
}
