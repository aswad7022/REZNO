import "server-only";

import {
  AI_GATE_A_POLICY_VERSION,
  AI_GATE_A_PROMPT_VERSION,
  type AiGatewayRequest,
  type AiGatewayResponse,
} from "./contracts";
import {
  normalizeAiInput,
  preflightAiRequest,
  validateAiGrounding,
} from "./policy";
import { AI_GATE_A_TOOL_REGISTRY } from "./tool-registry";

export type AiProvider = {
  readonly id: "local-deterministic";
  readonly external: false;
  complete(request: AiGatewayRequest, normalizedInput: string): Promise<AiGatewayResponse>;
};

export const localDeterministicAiProvider: AiProvider = {
  id: "local-deterministic",
  external: false,
  async complete(request, normalizedInput) {
    const tool = AI_GATE_A_TOOL_REGISTRY[0];
    return {
      ok: true,
      mode: "LOCAL_DETERMINISTIC",
      intent: normalizedInput ? "DISCOVERY" : "UNKNOWN",
      answer:
        request.locale === "en"
          ? "REZNO AI is in foundation mode. This deterministic response only proves policy, grounding, and evaluation contracts."
          : request.locale === "ckb"
            ? "REZNO AI لە دۆخی بنەماییدایە. ئەم وەڵامە حەتمییە تەنها گرێبەستەکانی سیاسەت و سەرچاوە و هەڵسەنگاندن دەسەلمێنێت."
            : "REZNO AI في وضع التأسيس. هذه استجابة حتمية لإثبات عقود السياسة والمصادر والتقييم فقط.",
      citations: [
        {
          id: "ai-gate-a-scope",
          sourceType: "REZNO_POLICY",
          title: "AI Gate A canonical scope",
          fieldPath: "docs/ai/ai-canonical-scope.md#ai-gate-a",
        },
      ],
      usedTools: tool ? [tool.name] : [],
      degraded: true,
      policyVersion: AI_GATE_A_POLICY_VERSION,
      promptVersion: AI_GATE_A_PROMPT_VERSION,
    };
  },
};

export async function runAiGateAGateway(
  request: AiGatewayRequest,
  provider: AiProvider = localDeterministicAiProvider,
) {
  const normalizedInput = normalizeAiInput(request.input, request.budget);
  const refusal = preflightAiRequest({
    normalizedInput,
    requestedUseCase: request.requestedUseCase,
    authorization: request.authorization,
    flags: request.flags,
  });
  if (refusal) return refusal;
  return validateAiGrounding(await provider.complete(request, normalizedInput));
}
