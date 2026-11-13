"use client";

import { useOptimistic, useTransition } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { setPaymentAction } from "@/app/admin/payment-actions";

/** 납부 체크 (PAY-01, 03). 누르면 납부, 다시 누르면 풀린다 */
export function PaymentToggle({ studentId, month, paid, label }: { studentId: string; month: string; paid: boolean; label: string }) {
  const [shown, setShown] = useOptimistic(paid);
  const [pending, start] = useTransition();

  function toggle() {
    const next = !shown;
    start(async () => {
      setShown(next);
      const res = await setPaymentAction(studentId, month, next);
      if (!res.ok) toast.error(res.error);
    });
  }

  return (
    <button
      type="button"
      aria-pressed={shown}
      aria-label={`${label} 납부`}
      disabled={pending}
      onClick={toggle}
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1 rounded-md border px-2.5 text-xs font-medium transition-colors disabled:cursor-wait",
        shown ? "border-emerald-600 bg-emerald-600 text-white" : "border-input bg-background text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {shown && <Check className="size-3.5" />}
      {shown ? "납부" : "납부 전"}
    </button>
  );
}
