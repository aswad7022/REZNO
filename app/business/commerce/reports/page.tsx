import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardPageHeader, DashboardShell } from "@/components/dashboard/dashboard-shell";
import { Input } from "@/components/ui/input";
import { parseCanonicalInstant } from "@/features/commerce/domain/admin-commerce";
import { requireAuthenticatedMerchantCommerceContext } from "@/features/commerce/services/authenticated-context";
import { getMerchantCommerceReports } from "@/features/commerce/services/merchant-report-service";

export default async function MerchantCommerceReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const [params, actor, t] = await Promise.all([
    searchParams,
    requireAuthenticatedMerchantCommerceContext("REPORTS_VIEW"),
    getTranslations("Commerce"),
  ]);
  const report = await getMerchantCommerceReports({ contextOrganizationId: actor.organizationId, membershipId: actor.membershipId, personId: actor.personId }, {
    from: parseCanonicalInstant(params.from, "from"),
    to: parseCanonicalInstant(params.to, "to"),
  });
  return <DashboardShell><DashboardPageHeader title={t("reportsTitle")} description={t("reportsDescription")} /><form className="grid gap-2 rounded-xl border p-4 md:grid-cols-3"><Input name="from" defaultValue={params.from} placeholder="from ISO UTC" dir="ltr" /><Input name="to" defaultValue={params.to} placeholder="to ISO UTC" dir="ltr" /><Button type="submit">{t("open")}</Button></form><p className="my-4 text-sm text-muted-foreground" dir="ltr">{report.range.from} — {report.range.to}</p><section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"><Metric title="Completed Orders" value={report.orders.completed} /><Metric title="Closed without completion" value={report.orders.cancelledRejectedExpired} /><Metric title="Units ordered" value={report.orders.unitsOrdered} /><Metric title="Active Products" value={report.products.active} /><Metric title="Low stock" value={report.inventory.lowStock} /><Metric title="Out of stock Products" value={report.inventory.outOfStockProducts} /></section><Card className="mt-4"><CardHeader><CardTitle>Top Products</CardTitle></CardHeader><CardContent>{report.products.topByOrderedQuantity.map((product) => <p key={`${product.productId}-${product.productName}`}>{product.productName} · {product.quantity}</p>)}</CardContent></Card></DashboardShell>;
}

function Metric({ title, value }: { title: string; value: number }) { return <Card><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{value}</CardContent></Card>; }
