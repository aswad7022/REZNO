import Link from "next/link";
import { Home } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { CustomerState } from "@/components/customer/customer-state";
import { Button } from "@/components/ui/button";

export default async function ForbiddenPage() {
  const [t, commonT] = await Promise.all([
    getTranslations("RouteAccess"),
    getTranslations("Common"),
  ]);

  return (
    <main className="rezno-premium-surface grid min-h-screen min-w-0 place-items-center p-6">
      <CustomerState
        action={
          <Button asChild>
            <Link href="/">
              <Home aria-hidden="true" />
              {commonT("backHome")}
            </Link>
          </Button>
        }
        className="w-full max-w-xl"
        description={t("forbiddenDescription")}
        reference="403"
        title={t("forbiddenTitle")}
        tone="permission"
      />
    </main>
  );
}
