"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    // Chrome の自動入力は React state に乗らないことがあるため、送信時は DOM 値を使う
    const formData = new FormData(e.currentTarget);
    const nextLoginId = String(formData.get("loginId") ?? "").trim();
    const nextPassword = String(formData.get("password") ?? "");
    setLoginId(nextLoginId);
    setPassword(nextPassword);

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loginId: nextLoginId, password: nextPassword }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "ログインに失敗しました");
      return;
    }

    const from = searchParams.get("from");
    if (from && from !== "/login" && from !== "/") {
      router.push(from);
    } else {
      router.push("/maker");
    }
    router.refresh();
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-sm rounded-lg border bg-white p-8 shadow-sm"
      autoComplete="on"
    >
      <h1 className="mb-6 text-center text-xl font-bold text-[#1e3a5f]">
        合格プログラム
      </h1>

      <label className="mb-4 block text-sm">
        アカウント名
        <input
          name="loginId"
          className="mt-1 w-full rounded border px-3 py-2"
          value={loginId}
          onChange={(e) => setLoginId(e.target.value)}
          onInput={(e) => setLoginId((e.target as HTMLInputElement).value)}
          autoComplete="username"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
      </label>

      <label className="mb-4 block text-sm">
        パスワード
        <input
          name="password"
          type="password"
          className="mt-1 w-full rounded border px-3 py-2"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
          autoComplete="current-password"
        />
      </label>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded bg-[#1e3a5f] py-2 text-white hover:bg-[#2a4f7a] disabled:opacity-50"
      >
        {loading ? "ログイン中…" : "ログイン"}
      </button>
    </form>
  );
}
