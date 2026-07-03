import { Bot } from "lucide-react";

import { BusinessCard } from "@/components/public-site/business-card";
import { DashboardEmpty } from "@/components/dashboard/dashboard-empty";
import {
  DashboardPageHeader,
  DashboardShell,
} from "@/components/dashboard/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getCurrentCustomerFavoriteBusinessIds } from "@/features/favorites/services/favorites";
import { Input } from "@/components/ui/input";
import { getLocalAssistantSuggestions } from "@/features/ai/services/local-assistant";
import { requireCustomerIdentity } from "@/features/identity/server";

export default async function CustomerAssistantPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireCustomerIdentity();
  const params = await searchParams;
  const prompt = params.q?.trim() ?? "";
  const suggestions = prompt
    ? await getLocalAssistantSuggestions(prompt)
    : { mode: "local" as const, businesses: [] };
  const favoriteState = await getCurrentCustomerFavoriteBusinessIds(
    suggestions.businesses.map((business) => business.id),
  );
  const businesses = suggestions.businesses.map((business) => ({
    ...business,
    isFavorited: favoriteState.favoriteOrganizationIds.has(business.id),
  }));

  return (
    <DashboardShell>
      <DashboardPageHeader
        title="مساعد REZNO"
        description="وضع التوصيات المحلي يعمل بدون أي مزود AI خارجي."
      />
      <Card className="border-primary/10">
        <CardContent className="p-4">
          <form className="flex flex-col gap-3 sm:flex-row">
            <Input
              name="q"
              defaultValue={prompt}
              placeholder="مثال: أريد مطعم قريب أو حلاق مناسب"
            />
            <Button type="submit">
              <Bot />
              اقتراحات
            </Button>
          </form>
        </CardContent>
      </Card>
      {businesses.length === 0 ? (
        <DashboardEmpty
          icon={Bot}
          title="اسأل عن مكان أو خدمة"
          description="سأقترح نتائج من بيانات السوق الحقيقية، بدون استدعاء أي API خارجي."
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {businesses.map((business) => (
            <BusinessCard
              key={business.id}
              business={business}
              canToggleFavorite={favoriteState.isAuthenticated}
            />
          ))}
        </div>
      )}
    </DashboardShell>
  );
}
