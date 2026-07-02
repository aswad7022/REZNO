export interface MessageActionState {
  status: "idle" | "success" | "error";
  message?: string;
}

export const initialMessageActionState: MessageActionState = { status: "idle" };
