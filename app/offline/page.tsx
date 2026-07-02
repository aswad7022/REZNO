import Link from "next/link";
import { WifiOff } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { PublicHeader } from "@/components/public-site/public-header";
import { Button } from "@/components/ui/button";

export default async function OfflinePage() {
  const t = await getTranslations("Pwa");
  return (
    <div className="min-h-screen">
      <PublicHeader />
      <main className="mx-auto grid min-h-[70vh] max-w-xl place-items-center px-4 text-center">
        <div>
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-muted">
            <WifiOff className="size-6" />
          </span>
          <h1 className="mt-5 text-2xl font-bold">{t("offlineTitle")}</h1>
          <p className="mt-2 text-muted-foreground">
            {t("offlineDescription")}
          </p>
          <Button asChild className="mt-6">
            <Link href="/">{t("tryAgain")}</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
