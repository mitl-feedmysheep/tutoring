"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormError } from "@/components/auth/auth-card";
import { changePasswordAction } from "@/app/auth-actions";
import type { Area } from "@/lib/auth/session";

export function ChangePasswordForm({ area, needsCurrent }: { area: Area; needsCurrent: boolean }) {
  const [state, action, pending] = useActionState(changePasswordAction.bind(null, area), undefined);
  return (
    <form action={action} className="grid gap-4">
      {needsCurrent && (
        <Field label="현재 비밀번호" htmlFor="current">
          <Input id="current" name="current" type="password" autoComplete="current-password" required />
        </Field>
      )}
      <Field label="새 비밀번호" htmlFor="next" hint="8자 이상">
        <Input id="next" name="next" type="password" autoComplete="new-password" minLength={8} maxLength={72} required />
      </Field>
      <Field label="새 비밀번호 확인" htmlFor="confirm">
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} maxLength={72} required />
      </Field>
      <FormError message={state?.error} />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "바꾸는 중..." : "비밀번호 바꾸기"}
      </Button>
    </form>
  );
}
