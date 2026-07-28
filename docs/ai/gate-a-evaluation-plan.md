# AI Gate A Evaluation Plan

Gate A evaluations are deterministic contract checks, not model-quality claims.

## Dataset coverage

The Gate A dataset covers:

- `ar`, `en`, and `ckb`;
- default disabled refusal;
- forbidden payment/action refusal;
- prompt-injection refusal;
- PII-like input refusal;
- one local deterministic grounded success path.

## Metrics

Gate A must pass:

- refusal-code accuracy for every expected refusal;
- grounding presence for any success;
- audit safety, including zero estimated cost and no raw prompt/answer fields;
- locale coverage for all supported languages;
- tool registry read-only invariant.

## Future evaluation gates

Later gates must add red-team prompts, retrieval-grounding precision, hallucination checks, latency and cost budgets, provider outage drills, accessibility review, and human review for high-risk use cases. Gate A intentionally avoids external model calls and therefore does not report model accuracy, ranking quality, or production readiness.
