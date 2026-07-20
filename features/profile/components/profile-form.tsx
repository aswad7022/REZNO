"use client";

import { useActionState } from "react";
import { LoaderCircle, Save } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProfile } from "@/features/profile/actions/update-profile";
import {
  initialProfileActionState,
  type ProfileDetails,
} from "@/features/profile/types";
import type { DashboardRole } from "@/types/dashboard";

function FieldError({ message }: { message?: string }) {
  return message ? (
    <p className="text-xs text-destructive" role="alert">
      {message}
    </p>
  ) : null;
}

function SubmitButton({
  pending,
  saving,
  save,
}: {
  pending: boolean;
  saving: string;
  save: string;
}) {
  return (
    <Button type="submit" disabled={pending}>
      {pending ? (
        <LoaderCircle className="animate-spin" aria-hidden="true" />
      ) : (
        <Save aria-hidden="true" />
      )}
      {pending ? saving : save}
    </Button>
  );
}

export function ProfileForm({
  profile,
  role,
}: {
  profile: ProfileDetails;
  role: DashboardRole;
}) {
  const action = updateProfile.bind(null, role);
  const t = useTranslations("Profile");
  const [state, formAction, pending] = useActionState(
    action,
    initialProfileActionState,
  );

  return (
    <form action={formAction} className="space-y-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="firstName">{t("fields.firstName")}</Label>
          <Input
            id="firstName"
            name="firstName"
            defaultValue={profile.firstName}
            autoComplete="given-name"
            required
            aria-invalid={Boolean(state.fieldErrors?.firstName)}
            aria-describedby={
              state.fieldErrors?.firstName ? "firstName-error" : undefined
            }
          />
          <span id="firstName-error">
            <FieldError message={state.fieldErrors?.firstName} />
          </span>
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">{t("fields.lastName")}</Label>
          <Input
            id="lastName"
            name="lastName"
            defaultValue={profile.lastName}
            autoComplete="family-name"
            aria-invalid={Boolean(state.fieldErrors?.lastName)}
            aria-describedby={
              state.fieldErrors?.lastName ? "lastName-error" : undefined
            }
          />
          <span id="lastName-error">
            <FieldError message={state.fieldErrors?.lastName} />
          </span>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="displayName">{t("fields.displayName")}</Label>
        <Input
          id="displayName"
          name="displayName"
          defaultValue={profile.displayName}
          placeholder={`${profile.firstName} ${profile.lastName}`.trim()}
          aria-invalid={Boolean(state.fieldErrors?.displayName)}
          aria-describedby="displayName-help displayName-error"
        />
        <p id="displayName-help" className="text-xs text-muted-foreground">
          {t("displayNameHelp")}
        </p>
        <span id="displayName-error">
          <FieldError message={state.fieldErrors?.displayName} />
        </span>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="email">{t("fields.email")}</Label>
          <Input
            id="email"
            type="email"
            value={profile.email}
            disabled
            aria-describedby="email-help"
          />
          <p id="email-help" className="text-xs text-muted-foreground">
            {t("emailHelp")}
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">{t("fields.phone")}</Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            defaultValue={profile.phone}
            autoComplete="tel"
            placeholder="+964 7XX XXX XXXX"
            aria-invalid={Boolean(state.fieldErrors?.phone)}
            aria-describedby={
              state.fieldErrors?.phone ? "phone-error" : undefined
            }
          />
          <span id="phone-error">
            <FieldError message={state.fieldErrors?.phone} />
          </span>
        </div>
      </div>

      <div className="flex flex-col-reverse gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
        <div
          aria-live="polite"
          className={
            state.status === "error"
              ? "text-sm text-destructive"
              : "text-sm text-muted-foreground"
          }
        >
          {state.message}
        </div>
        <SubmitButton
          pending={pending}
          saving={t("saving")}
          save={t("save")}
        />
      </div>
    </form>
  );
}
