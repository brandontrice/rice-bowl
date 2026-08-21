"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "sign-in" | "sign-up";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);
    const supabase = createClient();

    if (mode === "sign-in") {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError(signInError.message);
        setLoading(false);
        return;
      }
      router.push("/");
      router.refresh();
      return;
    }

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
    });
    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }
    setNotice("Check your email to confirm your account, then sign in.");
    setLoading(false);
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <header className="mb-9 text-center">
          <h1 className="font-display text-6xl uppercase leading-[0.85] text-ink">
            The Rice
            <br />
            Bowl
          </h1>
          <p className="mt-3 text-sm text-ink-dim">
            Same two managers. Never the same team twice.
          </p>
        </header>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 rounded-2xl border border-seam bg-surface p-5"
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="label">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-lg border border-seam bg-ground px-3 py-2.5 text-ink outline-none transition-colors focus:border-accent"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="label">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-lg border border-seam bg-ground px-3 py-2.5 text-ink outline-none transition-colors focus:border-accent"
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-crimson">
              {error}
            </p>
          )}
          {notice && <p className="text-sm text-jade">{notice}</p>}

          <button
            type="submit"
            disabled={loading}
            className="mt-1 rounded-lg bg-accent px-4 py-2.5 font-semibold text-ground transition hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Working…" : mode === "sign-in" ? "Sign in" : "Sign up"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode(mode === "sign-in" ? "sign-up" : "sign-in");
            setError(null);
            setNotice(null);
          }}
          className="mt-5 w-full text-center text-sm text-ink-dim transition-colors hover:text-ink"
        >
          {mode === "sign-in" ? "First time here? Sign up" : "Already have an account? Sign in"}
        </button>

        <p className="mt-6 text-center text-xs text-ink-faint">
          The league is invite-only — your email has to be on the manager allowlist.
        </p>
      </div>
    </div>
  );
}
