"use client";

import { useActionState } from "react";
import { Building2, LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { businessVerticals } from "@/features/businesses/config/verticals";
import { completeBusinessOnboarding } from "@/features/onboarding/actions/complete-onboarding";
import { initialBusinessOnboardingState } from "@/features/onboarding/types";

export function BusinessOnboardingForm() {
  const t = useTranslations("Onboarding");
  const [state, formAction, pending] = useActionState(
    completeBusinessOnboarding,
    initialBusinessOnboardingState,
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="organizationName">{t("businessName")}</Label>
        <Input
          id="organizationName"
          name="organizationName"
          autoComplete="organization"
          placeholder={t("businessNamePlaceholder")}
          required
          aria-invalid={Boolean(state.fieldErrors?.organizationName)}
          aria-describedby={
            state.fieldErrors?.organizationName
              ? "organizationName-error"
              : undefined
          }
        />
        {state.fieldErrors?.organizationName ? (
          <p
            id="organizationName-error"
            role="alert"
            className="text-xs text-destructive"
          >
            {state.fieldErrors.organizationName}
          </p>
        ) : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="slug">{t("businessSlug")}</Label>
        <div className="flex h-10 overflow-hidden rounded-md border bg-background focus-within:ring-2 focus-within:ring-ring">
          <span className="flex items-center border-e bg-muted px-3 text-sm text-muted-foreground" dir="ltr">
            rezno.net /
          </span>
          <Input
            id="slug"
            name="slug"
            dir="ltr"
            autoCapitalize="none"
            placeholder="alhakeem"
            required
            className="h-full rounded-none border-0 shadow-none focus-visible:ring-0"
            aria-invalid={Boolean(state.fieldErrors?.slug)}
          />
        </div>
        <p className="text-xs text-muted-foreground">{t("businessSlugHelp")}</p>
        {state.fieldErrors?.slug ? (
          <p role="alert" className="text-xs text-destructive">
            {state.fieldErrors.slug}
          </p>
        ) : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="branchName">{t("branchName")}</Label>
        <Input
          id="branchName"
          name="branchName"
          placeholder={t("branchNamePlaceholder")}
          required
          aria-invalid={Boolean(state.fieldErrors?.branchName)}
          aria-describedby={
            state.fieldErrors?.branchName ? "branchName-error" : undefined
          }
        />
        {state.fieldErrors?.branchName ? (
          <p
            id="branchName-error"
            role="alert"
            className="text-xs text-destructive"
          >
            {state.fieldErrors.branchName}
          </p>
        ) : null}
      </div>
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">
          {t("businessType.title")}
        </legend>
        <p className="text-xs text-muted-foreground">
          {t("businessType.description")}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {businessVerticals.map((vertical) => (
            <label
              key={vertical}
              className="group relative cursor-pointer rounded-2xl border bg-background p-3 transition hover:border-primary/40 hover:bg-primary/5 has-checked:border-primary has-checked:bg-primary/10 has-focus-visible:ring-3 has-focus-visible:ring-ring/40"
            >
              <input
                type="radio"
                name="vertical"
                value={vertical}
                required
                className="peer sr-only"
                aria-describedby={`vertical-${vertical}-description`}
              />
              <span className="flex items-start gap-3">
                <span className="mt-0.5 grid size-5 place-items-center rounded-full border border-muted-foreground/40 peer-checked:border-primary">
                  <span className="size-2 rounded-full bg-primary opacity-0 peer-checked:opacity-100" />
                </span>
                <span>
                  <span className="block text-sm font-semibold">
                    {t(`businessType.options.${vertical}.label`)}
                  </span>
                  <span
                    id={`vertical-${vertical}-description`}
                    className="mt-1 block text-xs leading-5 text-muted-foreground"
                  >
                    {t(`businessType.options.${vertical}.description`)}
                  </span>
                </span>
              </span>
            </label>
          ))}
        </div>
        {state.fieldErrors?.vertical ? (
          <p role="alert" className="text-xs text-destructive">
            {state.fieldErrors.vertical}
          </p>
        ) : null}
      </fieldset>
      {state.message ? (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? (
          <LoaderCircle className="animate-spin" aria-hidden="true" />
        ) : (
          <Building2 aria-hidden="true" />
        )}
        {pending ? t("creatingBusiness") : t("createBusiness")}
      </Button>
    </form>
  );
}
