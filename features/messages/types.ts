export interface MessageActionState {
  code?: string;
  conversationId?: string;
  status: "idle" | "success" | "error";
  message?: string;
}

export const initialMessageActionState: MessageActionState = { status: "idle" };
