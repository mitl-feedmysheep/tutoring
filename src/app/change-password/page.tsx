import type { Metadata } from "next";
import { ChangePasswordScreen } from "@/components/auth/screens";

export const metadata: Metadata = { title: "비밀번호 변경" };

export default function Page() {
  return <ChangePasswordScreen area="app" />;
}
