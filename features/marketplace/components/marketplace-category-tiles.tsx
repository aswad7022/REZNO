import Link from "next/link";
import {
  Dumbbell,
  HeartPulse,
  Scissors,
  Sparkles,
  Stethoscope,
  Utensils,
} from "lucide-react";
import type { BusinessVertical } from "@prisma/client";
import { getTranslations } from "next-intl/server";

import { Card, CardContent } from "@/components/ui/card";

const tiles: Array<{
  vertical: BusinessVertical;
  icon: typeof Utensils;
}> = [
  { vertical: "RESTAURANT", icon: Utensils },
  { vertical: "CAFE", icon: Utensils },
  { vertical: "BARBER", icon: Scissors },
  { vertical: "BEAUTY", icon: Sparkles },
  { vertical: "CLINIC", icon: Stethoscope },
  { vertical: "DENTIST", icon: Stethoscope },
  { vertical: "SPA", icon: HeartPulse },
  { vertical: "GYM", icon: Dumbbell },
  { vertical: "CONSULTANT", icon: Sparkles },
  { vertical: "OTHER", icon: Sparkles },
];

export async function MarketplaceCategoryTiles() {
  const t = await getTranslations("Marketplace.categoryTiles");

  return (
    <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
      {tiles.map((tile) => (
        <Link key={tile.vertical} href={`/marketplace?vertical=${tile.vertical}`}>
          <Card className="h-full border-primary/10 transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/10">
            <CardContent className="flex flex-col items-center gap-2 p-4 text-center">
              <span className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary">
                <tile.icon className="size-5" aria-hidden="true" />
              </span>
              <span className="text-sm font-semibold">
                {t(`${tile.vertical}.title`)}
              </span>
              <span className="line-clamp-2 text-xs leading-5 text-muted-foreground">
                {t(`${tile.vertical}.description`)}
              </span>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
