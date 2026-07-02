import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { selectActiveBusiness } from "@/features/business-context/actions/select-active-business";
import { getSafeBusinessReturnPath } from "@/features/business-context/utils/return-path";
import { getBusinessContextState } from "@/features/identity/server";

export default async function SelectBusinessPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const [context, params] = await Promise.all([
    getBusinessContextState(),
    searchParams,
  ]);

  if (context.status === "none") {
    redirect("/onboarding?intent=business");
  }

  if (context.status === "ready") {
    redirect(getSafeBusinessReturnPath(params.next));
  }

  const next = getSafeBusinessReturnPath(params.next);

  return (
    <main className="grid min-h-screen place-items-center bg-muted/30 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="text-2xl">اختر النشاط النشط</CardTitle>
          <p className="text-sm text-muted-foreground">
            لديك أكثر من نشاط. اختر النشاط الذي تريد إدارته الآن حتى لا يتم
            عرض أو تعديل بيانات نشاط آخر بالخطأ.
          </p>
        </CardHeader>
        <CardContent>
          <form action={selectActiveBusiness} className="space-y-4">
            <input type="hidden" name="next" value={next} />
            <div className="space-y-2">
              <Label htmlFor="businessId">النشاط</Label>
              <select
                id="businessId"
                name="businessId"
                required
                className="h-11 w-full rounded-xl border bg-background px-3 text-sm"
                defaultValue=""
              >
                <option value="" disabled>
                  اختر نشاطًا
                </option>
                {context.accessibleBusinesses.map((business) => (
                  <option key={business.id} value={business.id}>
                    {business.name}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" className="w-full">
              متابعة
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
