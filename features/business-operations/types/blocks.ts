export interface OperationalBlockView {
  deleteIdempotencyKey: string;
  endsAt: string;
  historical: boolean;
  id: string;
  reason: string | null;
  startsAt: string;
  updateIdempotencyKey: string;
  version: string;
}

export interface OperationalBlocksView {
  blocks: OperationalBlockView[];
  branchId: string;
  branchName: string;
  canWrite: boolean;
  createIdempotencyKey: string;
  organizationId: string;
  organizationName: string;
  timezone: string;
}

export interface OperationalBlockActionState {
  blockId?: string;
  code?: string;
  details?: Record<string, boolean | number | string | null>;
  message?: string;
  nextIdempotencyKey?: string;
  replayed?: boolean;
  status: "idle" | "success" | "error";
  version?: string;
}

export const initialOperationalBlockActionState: OperationalBlockActionState = {
  status: "idle",
};
