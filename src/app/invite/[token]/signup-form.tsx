"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormError } from "@/components/auth/auth-card";
import { signupAction } from "@/app/auth-actions";

export function SignupForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(signupAction.bind(null, token), undefined);
  const v = state?.values;
  return (
    <form action={action} className="grid gap-4">
      <Field label="이름" htmlFor="name">
        <Input id="name" name="name" autoComplete="name" maxLength={50} required defaultValue={v?.name} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="출생연도" htmlFor="birthYear">
          <Input
            id="birthYear"
            name="birthYear"
            inputMode="numeric"
            placeholder="1990"
            pattern="[0-9]{4}"
            maxLength={4}
            required
            defaultValue={v?.birthYear}
          />
        </Field>
        <fieldset className="grid gap-1.5">
          <legend className="mb-1.5 text-sm font-medium">성별</legend>
          <div className="flex h-9 items-center gap-4 text-sm">
            <label className="flex items-center gap-1.5">
              <input type="radio" name="gender" value="FEMALE" required defaultChecked={v?.gender === "FEMALE"} className="accent-primary" />
              여성
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" name="gender" value="MALE" defaultChecked={v?.gender === "MALE"} className="accent-primary" />
              남성
            </label>
          </div>
        </fieldset>
      </div>
      <Field label="이메일" htmlFor="email" hint="로그인할 때 써요">
        <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" maxLength={100} required defaultValue={v?.email} />
      </Field>
      <Field label="비밀번호" htmlFor="password" hint="8자 이상">
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} maxLength={72} required />
      </Field>
      <Field label="비밀번호 확인" htmlFor="confirm">
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} maxLength={72} required />
      </Field>
      <FormError message={state?.error} />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "가입하는 중..." : "가입하기"}
      </Button>
    </form>
  );
}
