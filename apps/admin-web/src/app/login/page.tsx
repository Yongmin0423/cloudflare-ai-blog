import type { Metadata } from "next";
import { LoginPreview } from "@/components/admin/login-preview";
export const metadata: Metadata = { title: "관리자 로그인 | Blog Studio" };
export default function LoginPage() { return <LoginPreview />; }
