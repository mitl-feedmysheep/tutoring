"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormError } from "@/components/auth/auth-card";
import { createTeacherAction } from "@/app/admin/actions";

export function CreateTeacherForm() {
  const [state, action, pending] = useActionState(createTeacherAction, undefined);
  return (
    <div className="grid gap-4 rounded-lg border bg-background p-4">
      <form action={action} className="grid items-start gap-4 sm:grid-cols-3">
        <Field label="이름" htmlFor="name">
          <Input id="name" name="name" maxLength={50} defaultValue={state?.values?.name} required />
        </Field>
        <Field label="이메일" htmlFor="email">
          <Input id="email" name="email" type="email" maxLength={100} autoComplete="off" defaultValue={state?.values?.email} required />
        </Field>
        {/* 선생님에게 그대로 알려 줄 값이라 가리지 않는다. 첫 로그인 때 바뀐다 */}
        <Field label="임시 비밀번호" htmlFor="password" hint="8자 이상">
          <Input id="password" name="password" type="text" autoComplete="off" minLength={8} maxLength={72} required />
        </Field>
        <div className="sm:col-span-3">
          <Button type="submit" disabled={pending}>
            {pending ? "만드는 중..." : "선생님 계정 만들기"}
          </Button>
        </div>
      </form>
      <FormError message={state?.error} />
      {state?.created && (
        <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {state.created.name} 선생님 계정을 만들었어요. 이메일({state.created.email})과 임시 비밀번호를 알려 주세요. 첫 로그인 때 새 비밀번호를
          정하게 돼요.
        </p>
      )}
    </div>
  );
}
