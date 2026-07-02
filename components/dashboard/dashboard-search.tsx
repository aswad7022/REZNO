"use client";

import { Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useState } from "react";
import { useTranslations } from "next-intl";

import { Input } from "@/components/ui/input";

export function DashboardSearch() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const t = useTranslations("Dashboard");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedQuery = query.trim();

    if (normalizedQuery) {
      router.push(`/marketplace?q=${encodeURIComponent(normalizedQuery)}`);
    } else {
      router.push("/marketplace");
    }
  }

  return (
    <form
      role="search"
      className="relative w-full max-w-md"
      onSubmit={handleSubmit}
    >
      <Search
        aria-hidden="true"
        className="absolute top-1/2 start-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="search"
        name="q"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t("searchPlaceholder")}
        aria-label={t("searchLabel")}
        className="h-9 bg-muted/40 ps-9"
      />
    </form>
  );
}
