"use client";

import Link from "next/link";
import { LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/client";
import { getSafeInternalPath } from "@/lib/navigation/safe-redirect";

export default function RegisterPage() {
  const searchParams = useSearchParams();
  const t = useTranslations("Auth");
  const [mode, setMode] = useState<"signin" | "signup">(
    searchParams.get("mode") === "signin" ? "signin" : "signup",
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const result =
      mode === "signin"
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({ name, email, password });
    setPending(false);

    if (result.error) {
      setError(t(mode === "signin" ? "signInFailure" : "failure"));
      return;
    }

    const next = searchParams.get("next");
    const intent = searchParams.get("intent");
    const safeNext = getSafeInternalPath(next, "");
    const query = new URLSearchParams();
    if (safeNext) query.set("next", safeNext);
    if (intent === "business") query.set("intent", "business");
    window.location.replace(
      query.size > 0 ? `/onboarding?${query.toString()}` : "/onboarding",
    );
  }

  return (
    <main className="grid min-h-screen place-items-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <Link
            href="/"
            className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-primary text-lg font-bold text-primary-foreground"
          >
            R
          </Link>
          <CardTitle className="text-2xl">
            {t(mode === "signin" ? "signInTitle" : "title")}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {t(mode === "signin" ? "signInDescription" : "description")}
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={register} className="space-y-4">
            <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
              <Button
                type="button"
                variant={mode === "signup" ? "secondary" : "ghost"}
                onClick={() => setMode("signup")}
              >
                {t("signUpTab")}
              </Button>
              <Button
                type="button"
                variant={mode === "signin" ? "secondary" : "ghost"}
                onClick={() => setMode("signin")}
              >
                {t("signInTab")}
              </Button>
            </div>
            {mode === "signup" ? (
              <div className="space-y-2">
                <Label htmlFor="name">{t("name")}</Label>
                <Input
                  id="name"
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  className="h-10"
                />
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="email">{t("email")}</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                dir="ltr"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                className="h-10"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t("password")}</Label>
              <Input
                id="password"
                type="password"
                autoComplete={
                  mode === "signin" ? "current-password" : "new-password"
                }
                dir="ltr"
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                className="h-10"
              />
            </div>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? <LoaderCircle className="animate-spin" /> : null}
              {pending
                ? t(mode === "signin" ? "signingIn" : "creating")
                : t(mode === "signin" ? "signInSubmit" : "submit")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
