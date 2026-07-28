import "server-only";

import type { AiToolDefinition } from "./contracts";

export const AI_GATE_A_TOOL_REGISTRY: readonly AiToolDefinition[] = [
  {
    name: "public_business_search",
    description: "Read-only lookup over public, customer-visible REZNO businesses.",
    allowedUseCases: ["CUSTOMER_DISCOVERY_INTENT", "READ_ONLY_OPTION_RANKING"],
    sideEffect: "NONE",
    maxResultCount: 6,
  },
  {
    name: "public_category_lookup",
    description: "Read-only lookup over public REZNO category labels and filters.",
    allowedUseCases: ["CATEGORY_FILTER_SUGGESTION", "GROUNDED_EXPLANATION"],
    sideEffect: "NONE",
    maxResultCount: 12,
  },
  {
    name: "public_business_summary",
    description: "Read-only summarization source for already authorized public business data.",
    allowedUseCases: ["PUBLIC_BUSINESS_SUMMARY", "GROUNDED_EXPLANATION"],
    sideEffect: "NONE",
    maxResultCount: 4,
  },
] as const;

export function getAiGateATool(name: string) {
  return AI_GATE_A_TOOL_REGISTRY.find((tool) => tool.name === name);
}

export function assertAiGateAToolsAreReadOnly() {
  return AI_GATE_A_TOOL_REGISTRY.every((tool) => tool.sideEffect === "NONE");
}
