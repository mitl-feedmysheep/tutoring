"use server";

import { redirect } from "next/navigation";
import { AuthError, authenticate, changePassword } from "@/lib/auth/login";
import { signupWithInvite } from "@/lib/auth/invite";
import { clearSessionCookie, getAccount, homePath, setSessionCookie } from "@/lib/auth/session";

export type FormState = { error?: string; values?: Record<string, string> } | undefined;

const str = (form: FormData, key: string) => String(form.get(key) ?? "");

export async function loginAction(_: FormState, form: FormData): Promise<FormState> {
  const email = str(form, "email");
  let account;
  try {
    account = await authenticate(email, str(form, "password"));
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message, values: { email } };
    throw e;
  }
  await setSessionCookie(account.claims);
  redirect(homePath(account));
}

export async function signupAction(token: string, _: FormState, form: FormData): Promise<FormState> {
  const values = {
    name: str(form, "name"),
    birthYear: str(form, "birthYear"),
    gender: str(form, "gender"),
    email: str(form, "email"),
  };
  let account;
  try {
    account = await signupWithInvite(token, { ...values, gender: values.gender as "MALE", password: str(form, "password"), confirm: str(form, "confirm") });
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message, values };
    throw e;
  }
  await setSessionCookie(account.claims);
  redirect("/");
}

export async function changePasswordAction(_: FormState, form: FormData): Promise<FormState> {
  const account = await getAccount();
  if (!account) redirect("/login");
  let claims;
  try {
    claims = await changePassword(account, { current: str(form, "current") || undefined, next: str(form, "next"), confirm: str(form, "confirm") });
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    throw e;
  }
  await setSessionCookie(claims);
  redirect(homePath({ ...account, mustChangePassword: false }));
}

export async function logoutAction() {
  await clearSessionCookie();
  redirect("/login");
}
