"use server";

import { redirect } from "next/navigation";
import { AuthError, authenticate, changePassword } from "@/lib/auth/login";
import { signupWithInvite } from "@/lib/auth/invite";
import { AREA_PATHS, clearSessionCookie, getAccount, homePath, setSessionCookie, type Area } from "@/lib/auth/session";

export type FormState = { error?: string; values?: Record<string, string> } | undefined;

const str = (form: FormData, key: string) => String(form.get(key) ?? "");
const toArea = (area: unknown): Area => (area === "admin" ? "admin" : "app");

export async function loginAction(rawArea: Area, _: FormState, form: FormData): Promise<FormState> {
  const area = toArea(rawArea);
  const email = str(form, "email");
  let account;
  try {
    account = await authenticate(email, str(form, "password"));
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message, values: { email } };
    throw e;
  }
  // 어드민은 선생님만. 학생이면 쿠키를 만들지 않는다
  if (area === "admin" && account.claims.role !== "teacher") {
    return { error: "선생님 계정만 들어올 수 있어요", values: { email } };
  }
  await setSessionCookie(area, account.claims);
  redirect(homePath(account, area));
}

export async function signupAction(token: string, _: FormState, form: FormData): Promise<FormState> {
  const values = {
    name: str(form, "name"),
    birthYear: str(form, "birthYear"),
    gender: str(form, "gender"),
    email: str(form, "email"),
    agree: str(form, "agree"),
  };
  let account;
  try {
    account = await signupWithInvite(token, {
      ...values,
      gender: values.gender as "MALE",
      agreePrivacy: (values.agree === "on") as true, // 서버에서 다시 검사한다
      password: str(form, "password"),
      confirm: str(form, "confirm"),
    });
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message, values };
    throw e;
  }
  await setSessionCookie("app", account.claims);
  redirect("/");
}

export async function changePasswordAction(rawArea: Area, _: FormState, form: FormData): Promise<FormState> {
  const area = toArea(rawArea);
  const account = await getAccount(area);
  if (!account) redirect(AREA_PATHS[area].login);
  let claims;
  try {
    claims = await changePassword(account, { current: str(form, "current") || undefined, next: str(form, "next"), confirm: str(form, "confirm") });
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    throw e;
  }
  await setSessionCookie(area, claims);
  redirect(AREA_PATHS[area].home);
}

export async function logoutAction(rawArea: Area) {
  const area = toArea(rawArea);
  await clearSessionCookie(area);
  redirect(AREA_PATHS[area].login);
}
