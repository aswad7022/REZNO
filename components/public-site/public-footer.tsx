import Link from "next/link";
import { getTranslations } from "next-intl/server";

export async function PublicFooter() {
  const t = await getTranslations("Public");
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>{t("footer")}</p>
        <div className="flex gap-2">
          <Link
            href="/marketplace"
            className="inline-flex min-h-11 items-center rounded-md px-2 transition-colors duration-(--motion-duration-fast) hover:text-foreground"
          >
            {t("marketplace")}
          </Link>
          <Link
            href="/register?mode=signin"
            className="inline-flex min-h-11 items-center rounded-md px-2 transition-colors duration-(--motion-duration-fast) hover:text-foreground"
          >
            {t("signIn")}
          </Link>
        </div>
      </div>
    </footer>
  );
}
