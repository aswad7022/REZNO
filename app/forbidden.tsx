import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default async function ForbiddenPage() {
  const [t, commonT] = await Promise.all([
    getTranslations("RouteAccess"),
    getTranslations("Common"),
  ]);

  return (
    <main className="grid min-h-screen place-items-center bg-muted/30 p-6 text-center">
      <Card className="w-full max-w-lg border-destructive/20 shadow-xl">
        <CardContent className="p-8">
          <div className="mx-auto grid size-14 place-items-center rounded-3xl bg-destructive/10 text-destructive">
            <ShieldAlert className="size-7" aria-hidden="true" />
          </div>
          <p className="mt-5 text-sm font-medium text-muted-foreground">403</p>
          <h1 className="mt-1 text-2xl font-bold">{t("forbiddenTitle")}</h1>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">
            {t("forbiddenDescription")}
          </p>
          <Button asChild className="mt-6">
            <Link href="/">{commonT("backHome")}</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
