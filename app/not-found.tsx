import Link from "next/link";
import { SearchX } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";

export default async function NotFound() {
  const t = await getTranslations("NotFound");
  return (
    <main className="grid min-h-screen place-items-center p-6 text-center">
      <div>
        <SearchX className="mx-auto size-12 text-muted-foreground" />
        <p className="mt-5 text-sm font-medium text-muted-foreground">404</p>
        <h1 className="mt-1 text-2xl font-bold">{t("title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("description")}</p>
        <Button asChild className="mt-6">
          <Link href="/">{t("home")}</Link>
        </Button>
      </div>
    </main>
  );
}
