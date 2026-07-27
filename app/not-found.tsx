import Link from "next/link";
import { Home } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { CustomerState } from "@/components/customer/customer-state";
import { Button } from "@/components/ui/button";

export default async function NotFound() {
  const t = await getTranslations("NotFound");
  return (
    <main className="rezno-premium-surface grid min-h-screen min-w-0 place-items-center p-6">
      <CustomerState
        action={
          <Button asChild>
            <Link href="/">
              <Home aria-hidden="true" />
              {t("home")}
            </Link>
          </Button>
        }
        className="w-full max-w-xl"
        description={t("description")}
        reference="404"
        title={t("title")}
        tone="empty"
      />
    </main>
  );
}
