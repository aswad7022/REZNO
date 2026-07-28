"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import type { AiLocale } from "@/features/ai/contracts";
import type { AiGateBPublicResponse } from "@/features/ai/gate-b";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

type Copy = {
  readonly inputLabel: string;
  readonly inputPlaceholder: string;
  readonly submit: string;
  readonly cancel: string;
  readonly retry: string;
  readonly loading: string;
  readonly cancelled: string;
  readonly automated: string;
  readonly citations: string;
  readonly unavailable: string;
  readonly offline: string;
  readonly sessionExpired: string;
  readonly resultReady: string;
  readonly noResults: string;
  readonly refusal: string;
};

type AssistantState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading"; readonly generation: number }
  | { readonly kind: "done"; readonly generation: number }
  | { readonly kind: "cancelled"; readonly generation: number }
  | { readonly kind: "error"; readonly generation: number; readonly reason: "offline" | "session-expired" | "unavailable" };

export function CustomerDiscoveryAssistant(props: {
  readonly locale: AiLocale;
  readonly copy: Copy;
}) {
  const [question, setQuestion] = useState("");
  const [lastQuestion, setLastQuestion] = useState("");
  const [state, setState] = useState<AssistantState>({ kind: "idle" });
  const [response, setResponse] = useState<AiGateBPublicResponse | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const resultRef = useRef<HTMLDivElement | null>(null);
  const canSubmit = useMemo(() => question.trim().length >= 3 && state.kind !== "loading", [question, state.kind]);

  useEffect(() => () => {
    generationRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  useEffect(() => {
    if (state.kind === "done" || state.kind === "error" || state.kind === "cancelled") {
      resultRef.current?.focus({ preventScroll: true });
    }
  }, [state]);

  async function submit(nextQuestion = question) {
    const trimmed = nextQuestion.trim().slice(0, 900);
    if (trimmed.length < 3) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      const generation = generationRef.current + 1;
      generationRef.current = generation;
      abortRef.current?.abort();
      abortRef.current = null;
      setLastQuestion(trimmed);
      setResponse(null);
      setState({ kind: "error", generation, reason: "offline" });
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    abortRef.current = controller;
    setLastQuestion(trimmed);
    setResponse(null);
    setState({ kind: "loading", generation });
    try {
      const result = await fetch("/api/ai/customer/discovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ question: trimmed, locale: props.locale }),
        signal: controller.signal,
      });
      const body = await result.json().catch(() => ({})) as { data?: AiGateBPublicResponse; error?: { message?: string } };
      if (generationRef.current !== generation || abortRef.current !== controller) return;
      abortRef.current = null;
      if (result.status === 401 || result.status === 403 || result.redirected) {
        setResponse(null);
        setState({ kind: "error", generation, reason: "session-expired" });
        return;
      }
      if (!body.data) throw new Error(body.error?.message ?? "AI unavailable");
      setResponse(body.data);
      setState({ kind: "done", generation });
    } catch (error) {
      if (generationRef.current !== generation || abortRef.current !== controller) return;
      if (error instanceof DOMException && error.name === "AbortError") return;
      abortRef.current = null;
      setResponse(null);
      setState({ kind: "error", generation, reason: "unavailable" });
    }
  }

  function cancel() {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    abortRef.current?.abort();
    abortRef.current = null;
    setResponse(null);
    setState({ kind: "cancelled", generation });
  }

  const statusMessage = getStatusMessage(state, response, props.copy, props.locale);

  return (
    <Card className="border-primary/20">
      <CardContent className="space-y-4 p-6">
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label className="text-sm font-medium" htmlFor="ai-discovery-question">
            {props.copy.inputLabel}
          </label>
          <Textarea
            id="ai-discovery-question"
            ref={inputRef}
            aria-describedby="ai-discovery-status ai-discovery-automation-note"
            maxLength={900}
            rows={4}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder={props.copy.inputPlaceholder}
            disabled={state.kind === "loading"}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={!canSubmit} aria-busy={state.kind === "loading"}>
              {state.kind === "loading" ? props.copy.loading : props.copy.submit}
            </Button>
            {state.kind === "loading" ? (
              <Button type="button" variant="outline" onClick={cancel}>
                {props.copy.cancel}
              </Button>
            ) : null}
            {state.kind === "error" && lastQuestion ? (
              <Button type="button" variant="outline" onClick={() => void submit(lastQuestion)}>
                {props.copy.retry}
              </Button>
            ) : null}
          </div>
        </form>
        <p id="ai-discovery-automation-note" className="text-xs text-muted-foreground">{props.copy.automated}</p>
        <div
          id="ai-discovery-status"
          ref={resultRef}
          role="status"
          aria-live="polite"
          aria-atomic="true"
          tabIndex={-1}
          className="rounded-md border bg-muted/30 p-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
        >
          {statusMessage}
        </div>
        {response ? <AssistantResult response={response} locale={props.locale} copy={props.copy} /> : null}
      </CardContent>
    </Card>
  );
}

function getStatusMessage(
  state: AssistantState,
  response: AiGateBPublicResponse | null,
  copy: Copy,
  locale: AiLocale,
) {
  if (state.kind === "loading") return copy.loading;
  if (state.kind === "cancelled") return copy.cancelled;
  if (state.kind === "error") {
    if (state.reason === "offline") return copy.offline;
    if (state.reason === "session-expired") return copy.sessionExpired;
    return copy.unavailable;
  }
  if (state.kind === "done" && response) {
    if (response.ok) return copy.resultReady;
    if (response.status === "NO_RESULTS") return copy.noResults;
    if (response.status === "REFUSAL") return copy.refusal;
    return response.safeMessage[locale];
  }
  return copy.automated;
}

function AssistantResult(props: { readonly response: AiGateBPublicResponse; readonly locale: AiLocale; readonly copy: Copy }) {
  const response = props.response;
  if (!response.ok) {
    return (
      <div role="status" className="rounded-md border bg-muted/40 p-4 text-sm">
        {response.safeMessage[props.locale]}
      </div>
    );
  }
  return (
    <section className="space-y-3" aria-live="polite">
      <div className="rounded-md border bg-muted/30 p-4 text-sm leading-6">{response.answer}</div>
      <div className="space-y-2">
        <h2 className="text-sm font-semibold">{props.copy.citations}</h2>
        {response.citations.map((citation) => (
          <Link
            key={citation.id}
            href={citation.href}
            className="block rounded-md border p-3 text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="font-medium">{citation.title}</span>
            <span className="block text-muted-foreground">{citation.reason}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
