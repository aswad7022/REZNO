import { CommerceDomainError } from "@/features/commerce/domain/errors";

export interface CommerceActionState {
  code?: string;
  message: string;
  ok: boolean;
}

const INITIAL_ERROR: CommerceActionState = {
  message: "تعذر تنفيذ العملية.",
  ok: false,
};

export function actionError(error: unknown): CommerceActionState {
  if (error instanceof CommerceDomainError) {
    return { code: error.code, message: error.message, ok: false };
  }
  return INITIAL_ERROR;
}
