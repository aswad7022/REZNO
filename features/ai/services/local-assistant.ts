import "server-only";

import type { BusinessVertical } from "@prisma/client";

import { searchMarketplace } from "@/features/marketplace/services/marketplace";

function inferVertical(prompt: string): BusinessVertical | undefined {
  const text = prompt.toLowerCase();
  if (/(restaurant|مطعم|چێشتخانە)/i.test(text)) return "RESTAURANT";
  if (/(cafe|coffee|كاف|قهوة|کافێ)/i.test(text)) return "CAFE";
  if (/(barber|حلاق|حلاقة|قژ)/i.test(text)) return "BARBER";
  if (/(beauty|salon|تجميل|صالون)/i.test(text)) return "BEAUTY";
  if (/(clinic|عيادة|کلینیک)/i.test(text)) return "CLINIC";
  if (/(dentist|أسنان|ددان)/i.test(text)) return "DENTIST";
  if (/(gym|رياض|وەرزش)/i.test(text)) return "GYM";
  return undefined;
}

export async function getLocalAssistantSuggestions(prompt: string) {
  const vertical = inferVertical(prompt);
  const businesses = await searchMarketplace({
    query: vertical ? undefined : prompt,
    vertical,
    take: 6,
  });

  return {
    mode: "local" as const,
    vertical,
    businesses,
  };
}
