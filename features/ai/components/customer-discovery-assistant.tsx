"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";

import type { AiLocale } from "@/features/ai/contracts";
import type { AiGateBResponse } from "@/features/ai/gate-b";
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
  readonly automated: string;
  readonly citations: string;
  readonly unavailable: string;
};

export function CustomerDiscoveryAssistant(props: {
  readonly locale: AiLocale;
  readonly copy: Copy;
}) {
  const [question, setQuestion] = useState("");
  const [lastQuestion, setLastQuestion] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [response, setResponse] = useState<AiGateBResponse | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const canSubmit = useMemo(() => question.trim().length >= 3 && state !== "loading", [question, state]);

  async function submit(nextQuestion = question) {
    const trimmed = nextQuestion.trim().slice(0, 900);
    if (trimmed.length < 3) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLastQuestion(trimmed);
    setState("loading");
    try {
      const result = await fetch("/api/ai/customer/discovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ question: trimmed, locale: props.locale }),
        signal: controller.signal,
      });
      const body = await result.json() as { data?: AiGateBResponse; error?: { message?: string } };
      if (!body.data) throw new Error(body.error?.message ?? "AI unavailable");
      setResponse(body.data);
      setState("done");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setResponse(null);
      setState("error");
    }
  }

  function cancel() {
    abortRef.current?.abort();
    abortRef.current = null;
    setState("idle");
  }

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
            maxLength={900}
            rows={4}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder={props.copy.inputPlaceholder}
            disabled={state === "loading"}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={!canSubmit}>
              {state === "loading" ? props.copy.loading : props.copy.submit}
            </Button>
            {state === "loading" ? (
              <Button type="button" variant="outline" onClick={cancel}>
                {props.copy.cancel}
              </Button>
            ) : null}
            {state === "error" && lastQuestion ? (
              <Button type="button" variant="outline" onClick={() => void submit(lastQuestion)}>
                {props.copy.retry}
              </Button>
            ) : null}
          </div>
        </form>
        <p className="text-xs text-muted-foreground">{props.copy.automated}</p>
        {state === "error" ? (
          <div role="status" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
            {props.copy.unavailable}
          </div>
        ) : null}
        {response ? <AssistantResult response={response} locale={props.locale} copy={props.copy} /> : null}
      </CardContent>
    </Card>
  );
}

function AssistantResult(props: { readonly response: AiGateBResponse; readonly locale: AiLocale; readonly copy: Copy }) {
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
