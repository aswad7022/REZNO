import { NextResponse, type NextRequest } from "next/server";

import { getAiGateBCapability, runAiGateBCustomerDiscovery } from "@/features/ai/gate-b";
import { createGeminiGateBProvider } from "@/features/ai/gemini-provider";
import { requireCustomerIdentity } from "@/features/identity/server";
import type { AiLocale } from "@/features/ai/contracts";
import { logServerError } from "@/lib/logging/server";

export const dynamic = "force-dynamic";
const MAX_REQUEST_BYTES = 4096;

export async function GET() {
  await requireCustomerIdentity();
  return NextResponse.json({ capability: getAiGateBCapability() });
}

export async function POST(request: NextRequest) {
  await requireCustomerIdentity();
  const capability = getAiGateBCapability();
  if (!capability.enabled) {
    return NextResponse.json({ error: { code: capability.reason, message: "REZNO AI is not available." } }, { status: 503 });
  }
  try {
    const body = await readBoundedJson(request);
    const question = typeof body.question === "string" ? body.question : "";
    const locale = parseLocale(body.locale);
    const response = await runAiGateBCustomerDiscovery({
      locale,
      question,
      provider: createGeminiGateBProvider(),
      signal: request.signal,
    });
    return NextResponse.json({ data: response }, { status: response.ok ? 200 : response.status === "RATE_LIMITED" ? 429 : response.status === "TIMEOUT" ? 504 : 200 });
  } catch (error) {
    logServerError("api.ai.customer.discovery", error);
    return NextResponse.json({ error: { code: "AI_UNAVAILABLE", message: "REZNO AI is unavailable." } }, { status: 503 });
  }
}

function parseLocale(value: unknown): AiLocale {
  return value === "ar" || value === "ckb" || value === "en" ? value : "en";
}

async function readBoundedJson(request: NextRequest): Promise<{ question?: unknown; locale?: unknown }> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLocaleLowerCase().includes("application/json")) {
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
  const parsed = JSON.parse(new TextDecoder().decode(merged)) as unknown;
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as { question?: unknown; locale?: unknown }
    : {};
}
