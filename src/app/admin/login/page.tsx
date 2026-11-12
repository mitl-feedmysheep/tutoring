import type { Metadata } from "next";
import { LoginScreen } from "@/components/auth/screens";

export const metadata: Metadata = { title: "어드민 로그인" };

export default function Page() {
  return <LoginScreen area="admin" />;
}
