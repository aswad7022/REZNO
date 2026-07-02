import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default async function AdminForbiddenPage() {
  const [adminT, commonT] = await Promise.all([
    getTranslations("Admin"),
    getTranslations("Common"),
  ]);

  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 px-4 py-10">
      <Card className="w-full max-w-lg border-destructive/20 text-center shadow-xl">
        <CardContent className="p-8">
          <div className="mx-auto grid size-14 place-items-center rounded-3xl bg-destructive/10 text-destructive">
            <ShieldAlert className="size-7" aria-hidden="true" />
          </div>
          <h1 className="mt-5 text-2xl font-bold">
            403 — {adminT("unauthorized")}
          </h1>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">
            {adminT("accessDenied")}
          </p>
          <Button asChild className="mt-6">
            <Link href="/">{commonT("backHome")}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
