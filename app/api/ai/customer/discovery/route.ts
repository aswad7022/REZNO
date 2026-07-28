import { NextResponse, type NextRequest } from "next/server";

import {
  createAiGateBRefusalResponse,
  runAiGateBCustomerDiscovery,
  shouldRefuseAiGateBQuestion,
  toPublicAiGateBResponse,
} from "@/features/ai/gate-b";
import {
  createAiGateCControlledGeminiProvider,
  createAiGateCRequestCorrelationId,
  getAiGateCClientReadiness,
  getAiGateCProviderReadiness,
} from "@/features/ai/provider-operations";
import { acquireAiGateCProviderBudget } from "@/features/ai/rate-limit";
import { requireCustomerIdentity } from "@/features/identity/server";
import type { AiLocale } from "@/features/ai/contracts";
import { logServerError } from "@/lib/logging/server";

export const dynamic = "force-dynamic";
const MAX_REQUEST_BYTES = 4096;
const noStore = { "Cache-Control": "no-store, max-age=0" };

export async function GET() {
  await requireCustomerIdentity();
  return NextResponse.json({ capability: getAiGateCClientReadiness() }, { headers: noStore });
}

export async function POST(request: NextRequest) {
  const identity = await requireCustomerIdentity();
  const capability = getAiGateCProviderReadiness();
  if (!capability.enabled) {
    return NextResponse.json({ error: { code: "AI_UNAVAILABLE", message: "REZNO AI is not available." } }, { headers: noStore, status: 503 });
  }
  const correlationId = createAiGateCRequestCorrelationId();
  let budget: Awaited<ReturnType<typeof acquireAiGateCProviderBudget>> | null = null;
  try {
    const body = await readBoundedJson(request);
    const question = typeof body.question === "string" ? body.question : "";
    const locale = parseLocale(body.locale);
    if (shouldRefuseAiGateBQuestion(question)) {
      return NextResponse.json(
        { data: createAiGateBRefusalResponse({ question }) },
        { headers: noStore },
      );
    }
    budget = await acquireAiGateCProviderBudget(identity.person.id);
    if (!budget.ok) {
      return NextResponse.json(
        { data: rateLimitedResponse(locale, budget.code) },
        { headers: { ...noStore, "Retry-After": String(budget.retryAfterSeconds) }, status: budget.code === "RATE_LIMITED" ? 429 : 503 },
      );
    }
    const response = await runAiGateBCustomerDiscovery({
      locale,
      question,
      provider: createAiGateCControlledGeminiProvider({
        personId: identity.person.id,
        correlationId,
      }),
      skipCapabilityCheck: true,
      signal: request.signal,
    });
    return NextResponse.json({ data: toPublicAiGateBResponse(response) }, { headers: noStore, status: response.ok ? 200 : response.status === "RATE_LIMITED" ? 429 : response.status === "TIMEOUT" ? 504 : 200 });
  } catch (error) {
    logServerError("api.ai.customer.discovery", error);
    return NextResponse.json({ error: { code: "AI_UNAVAILABLE", message: "REZNO AI is unavailable." } }, { headers: noStore, status: 503 });
  } finally {
    if (budget?.ok) await budget.release();
  }
}

function parseLocale(value: unknown): AiLocale {
  return value === "ar" || value === "ckb" || value === "en" ? value : "en";
}

function rateLimitedResponse(locale: AiLocale, code: "RATE_LIMITED" | "UNAVAILABLE") {
  const safeMessage = code === "RATE_LIMITED"
    ? {
        ar: "وصلت خدمة الذكاء الاصطناعي إلى حدها المؤقت. جرّب بعد قليل.",
        ckb: "خزمەتی AI سنووری کاتی گەیشت. کەمێک دواتر هەوڵبدەوە.",
        en: "The AI service reached its temporary limit. Please try again shortly.",
      }
    : {
        ar: "المساعد غير متاح الآن. جرّب لاحقًا.",
        ckb: "یاریدەدەر ئێستا بەردەست نییە. دواتر هەوڵبدەوە.",
        en: "The assistant is unavailable right now. Please try again later.",
      };
  return {
    ok: false,
    status: code,
    safeMessage,
    automated: true,
    metadata: {
      policyVersion: "ai-gate-b-policy-v1",
      promptVersion: "ai-gate-b-gemini-discovery-v1",
      evalVersion: "ai-gate-b-evals-v1",
      provider: "none",
      modelId: null,
      inputChars: 0,
      marketplaceResultCount: 0,
      providerRequestCount: 0,
      latencyMs: 0,
    },
  } as const;
}

async function readBoundedJson(request: NextRequest): Promise<{ question?: unknown; locale?: unknown }> {
  const contentType = request.headers.get("content-type") ?? "";
  const mediaType = contentType.split(";")[0]?.trim().toLocaleLowerCase();
  if (mediaType !== "application/json") {
    throw new Error("AI request content type is invalid.");
  }
  const declaredLength = Number(request.headers.get("content-length") ?? Number.NaN);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    throw new Error("AI request is too large.");
  }
  const reader = request.body?.getReader();
  if (!reader) return {};
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_REQUEST_BYTES) {
      await reader.cancel();
      throw new Error("AI request is too large.");
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(merged)) as unknown;
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as { question?: unknown; locale?: unknown }
    : {};
}
