"use client";

import { Button } from "@/components/ui/button";

export default function AdminCommerceError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="rounded-xl border border-destructive/40 p-6" role="alert">
    <h2 className="font-bold">تعذر تحميل بيانات إدارة التجارة</h2>
    <p className="mt-2 text-sm text-muted-foreground">تحقق من المدخلات والصلاحيات ثم أعد المحاولة. لم يتم تنفيذ أي تغيير.</p>
    <Button className="mt-4" onClick={reset}>إعادة المحاولة</Button>
  </div>;
}
