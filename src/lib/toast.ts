import { toast as base } from "sonner";

// sonner toast 그대로 쓰되, 성공 알림("~했어요") 끝에는 웃는 이모지를 붙인다
type Success = typeof base.success;

const success: Success = (message, data) => base.success(typeof message === "string" ? `${message} 😊` : message, data);

export const toast: typeof base = Object.assign((...args: Parameters<typeof base>) => base(...args), base, { success });
