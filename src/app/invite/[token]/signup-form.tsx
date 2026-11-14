"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormError } from "@/components/auth/auth-card";
import { signupAction } from "@/app/auth-actions";

export function SignupForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(signupAction.bind(null, token), undefined);
  const v = state?.values;
  // 칸을 모두 채우고 동의에 체크해야 가입하기가 켜진다. 브라우저의 "이 입력란을 작성하세요" 말풍선 대신 버튼으로 알린다.
  // 비밀번호는 다시 채워 넣지 않으므로 처음(오류 뒤 포함)에는 늘 꺼져 있다
  const [ready, setReady] = useState(false);
  return (
    <form action={action} onChange={(e) => setReady(e.currentTarget.checkValidity())} className="grid gap-4">
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
      <PrivacyConsent defaultChecked={v?.agree === "on"} />
      <FormError message={state?.error} />
      <Button type="submit" disabled={pending || !ready} className="w-full">
        {pending ? "가입하는 중..." : "가입하기"}
      </Button>
    </form>
  );
}

/** AUTH-13: 개인정보보호법 제15조 고지 항목(목적, 항목, 보유 기간, 거부 권리)과 필수 동의 */
function PrivacyConsent({ defaultChecked }: { defaultChecked: boolean }) {
  return (
    <div className="grid gap-2">
      <div className="rounded-md border bg-muted/40 px-3 py-2.5 text-xs leading-relaxed break-keep text-muted-foreground">
        <p className="mb-1 font-medium text-foreground">개인정보 수집·이용 안내</p>
        <dl className="grid grid-cols-[4.5rem_1fr] gap-x-2 gap-y-1">
          <dt>수집 항목</dt>
          <dd>이름, 출생연도, 성별, 이메일, 비밀번호(암호화 저장)</dd>
          <dt>이용 목적</dt>
          <dd>수업 일정 관리, 화상 수업, 학습 기록과 피드백, 과외비 확인, 알림</dd>
          <dt>보관 기간</dt>
          <dd>수업을 받는 동안. 삭제를 요청하면 바로 지워요</dd>
        </dl>
        <p className="mt-1.5">
          동의하지 않을 수 있지만, 동의해야 가입할 수 있어요.{" "}
          <Link href="/privacy" target="_blank" className="font-medium text-foreground underline underline-offset-2">
            개인정보처리방침
          </Link>
        </p>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="agree" required defaultChecked={defaultChecked} className="size-4 accent-primary" />
        개인정보 수집·이용에 동의해요 <span className="text-muted-foreground">(필수)</span>
      </label>
    </div>
  );
}
