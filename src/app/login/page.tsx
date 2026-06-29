import { Suspense } from "react";
import { LoginForm } from "@/components/LoginForm";

export const metadata = { title: "ログイン | 合格プログラム" };

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
