import Link from "next/link";
import { getTranslations } from "next-intl/server";

export async function PublicFooter() {
  const t = await getTranslations("Public");
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>{t("footer")}</p>
        <div className="flex gap-4">
          <Link href="/marketplace" className="hover:text-foreground">
            {t("marketplace")}
          </Link>
          <Link
            href="/register?mode=signin"
            className="hover:text-foreground"
          >
            {t("signIn")}
          </Link>
        </div>
      </div>
    </footer>
  );
}
