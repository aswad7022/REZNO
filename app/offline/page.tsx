import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { CustomerState } from "@/components/customer/customer-state";
import { PublicHeader } from "@/components/public-site/public-header";
import { Button } from "@/components/ui/button";

export default async function OfflinePage() {
  const t = await getTranslations("Pwa");
  return (
    <div className="min-h-screen">
      <PublicHeader />
      <main
        className="rezno-premium-surface mx-auto grid min-h-[70vh] w-full min-w-0 max-w-3xl place-items-center px-4 py-12"
        data-customer-surface="offline"
      >
        <CustomerState
          action={
            <Button asChild>
              <Link href="/">
                <RotateCcw aria-hidden="true" />
                {t("tryAgain")}
              </Link>
            </Button>
          }
          description={t("offlineDescription")}
          title={t("offlineTitle")}
          tone="offline"
        />
      </main>
    </div>
  );
}
