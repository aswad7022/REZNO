"use client";

import Image from "next/image";
import type { FormEvent, ReactNode } from "react";
import { useActionState, useState } from "react";
import { Eye, ImageIcon, LoaderCircle, Save } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { updateBusinessProfile } from "@/features/business/actions/update-business-profile";
import {
  initialBusinessProfileActionState,
  type BusinessProfileDetails,
  type BusinessProfileField,
} from "@/features/business/types";
import { safePublicImageUrlOrNull } from "@/lib/security/public-image-url";

function FormField({
  children,
  error,
  htmlFor,
  label,
}: {
  children: ReactNode;
  error?: string;
  htmlFor: BusinessProfileField;
  label: string;
}) {
  const errorId = `${htmlFor}-error`;

  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function BusinessProfileForm({
  profile,
}: {
  profile: BusinessProfileDetails;
}) {
  const t = useTranslations("BusinessManagement");
  const common = useTranslations("Common");
  const [state, formAction, pending] = useActionState(
    updateBusinessProfile,
    initialBusinessProfileActionState,
  );
  const disabled = !profile.canEdit || pending;
  const [preview, setPreview] = useState({
    name: profile.name,
    description: profile.description,
    logoUrl: profile.logoUrl,
    coverImageUrl: profile.coverImageUrl,
  });

  function previewUrl(value: string): string | null {
    return safePublicImageUrlOrNull(value);
  }

  function updatePreview(event: FormEvent<HTMLFormElement>) {
    const data = new FormData(event.currentTarget);
    setPreview({
      name: String(data.get("name") ?? ""),
      description: String(data.get("description") ?? ""),
      logoUrl: profile.logoUrl,
      coverImageUrl: profile.coverImageUrl,
    });
  }

  function fieldProps(field: BusinessProfileField) {
    const error = state.fieldErrors?.[field];

    return {
      "aria-describedby": error ? `${field}-error` : undefined,
      "aria-invalid": Boolean(error),
      disabled,
      id: field,
      name: field,
    };
  }

  return (
    <form action={formAction} onChange={updatePreview} className="space-y-6">
      <Card className="overflow-hidden border-primary/15">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="size-4" />
            {t("previewTitle")}
          </CardTitle>
          <CardDescription>{t("previewDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-2xl border bg-background shadow-sm">
            <div className="relative aspect-[16/5] min-h-32 bg-gradient-to-l from-blue-600 to-violet-600">
              {previewUrl(preview.coverImageUrl) ? (
                <Image
                  src={preview.coverImageUrl}
                  alt=""
                  fill
                  sizes="(max-width: 768px) 100vw, 900px"
                  className="object-cover"
                />
              ) : null}
            </div>
            <div className="relative px-5 pb-6">
              <div className="relative -mt-10 flex size-20 items-center justify-center overflow-hidden rounded-2xl border-4 border-background bg-muted shadow-md">
                {previewUrl(preview.logoUrl) ? (
                  <Image
                    src={preview.logoUrl}
                    alt=""
                    fill
                    sizes="80px"
                    className="object-cover"
                  />
                ) : (
                  <ImageIcon className="size-7 text-primary/40" />
                )}
              </div>
              <h3 className="mt-3 text-xl font-semibold text-primary">
                {preview.name || t("previewNameFallback")}
              </h3>
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                {preview.description || t("previewDescriptionFallback")}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("generalTitle")}</CardTitle>
          <CardDescription>{t("generalDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          <FormField
            htmlFor="name"
            label={t("fields.name")}
            error={state.fieldErrors?.name}
          >
            <Input {...fieldProps("name")} defaultValue={profile.name} />
          </FormField>

          <FormField
            htmlFor="visibility"
            label={t("fields.visibility")}
            error={state.fieldErrors?.visibility}
          >
            <Select
              name="visibility"
              defaultValue={profile.visibility}
              disabled={disabled}
            >
              <SelectTrigger id="visibility" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PUBLISHED">{t("visibility.PUBLISHED")}</SelectItem>
                <SelectItem value="HIDDEN">{t("visibility.HIDDEN")}</SelectItem>
              </SelectContent>
            </Select>
          </FormField>

          <FormField
            htmlFor="slug"
            label={t("fields.slug")}
            error={state.fieldErrors?.slug}
          >
            <div className="flex h-10 overflow-hidden rounded-md border bg-background focus-within:ring-2 focus-within:ring-ring">
              <span className="flex items-center border-e bg-muted px-3 text-sm text-muted-foreground" dir="ltr">
                rezno.net /
              </span>
              <Input
                {...fieldProps("slug")}
                defaultValue={profile.slug}
                dir="ltr"
                autoCapitalize="none"
                placeholder="alhakeem"
                className="h-full rounded-none border-0 shadow-none focus-visible:ring-0"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {t("slugHelp", { slug: profile.slug })}
            </p>
          </FormField>

          <FormField
            htmlFor="businessCategory"
            label={t("fields.businessCategory")}
            error={state.fieldErrors?.businessCategory}
          >
            <Input
              {...fieldProps("businessCategory")}
              defaultValue={profile.businessCategory}
              placeholder={t("placeholders.businessCategory")}
            />
          </FormField>

          <FormField
            htmlFor="businessType"
            label={t("fields.businessType")}
            error={state.fieldErrors?.businessType}
          >
            <Select
              name="businessType"
              defaultValue={profile.businessType}
              disabled={disabled}
            >
              <SelectTrigger
                id="businessType"
                className="w-full"
                aria-invalid={Boolean(state.fieldErrors?.businessType)}
                aria-describedby={
                  state.fieldErrors?.businessType
                    ? "businessType-error"
                    : undefined
                }
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PHYSICAL">
                  {t("businessTypes.PHYSICAL")}
                </SelectItem>
                <SelectItem value="ONLINE">
                  {t("businessTypes.ONLINE")}
                </SelectItem>
                <SelectItem value="HYBRID">
                  {t("businessTypes.HYBRID")}
                </SelectItem>
              </SelectContent>
            </Select>
          </FormField>

          <FormField
            htmlFor="legalName"
            label={t("fields.legalName")}
            error={state.fieldErrors?.legalName}
          >
            <Input
              {...fieldProps("legalName")}
              defaultValue={profile.legalName}
              placeholder={t("placeholders.legalName")}
            />
          </FormField>

          <FormField
            htmlFor="description"
            label={t("fields.description")}
            error={state.fieldErrors?.description}
          >
            <Textarea
              {...fieldProps("description")}
              defaultValue={profile.description}
              placeholder={t("placeholders.description")}
              className="min-h-28 resize-y"
            />
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("publicInfoTitle")}</CardTitle>
          <CardDescription>{t("publicInfoDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          <FormField
            htmlFor="googleMapsUrl"
            label={t("fields.googleMapsUrl")}
            error={state.fieldErrors?.googleMapsUrl}
          >
            <Input
              {...fieldProps("googleMapsUrl")}
              type="url"
              dir="ltr"
              defaultValue={profile.googleMapsUrl}
              placeholder="https://maps.google.com/..."
            />
          </FormField>
          <FormField
            htmlFor="bookingPolicy"
            label={t("fields.bookingPolicy")}
            error={state.fieldErrors?.bookingPolicy}
          >
            <Textarea
              {...fieldProps("bookingPolicy")}
              defaultValue={profile.bookingPolicy}
              className="min-h-28"
            />
          </FormField>
          <div className="md:col-span-2">
            <FormField
              htmlFor="faqItems"
              label={t("fields.faqItems")}
              error={state.fieldErrors?.faqItems}
            >
              <Textarea
                {...fieldProps("faqItems")}
                defaultValue={profile.faqItems
                  .map((item) => `${item.question} | ${item.answer}`)
                  .join("\n")}
                className="min-h-32"
                placeholder={t("placeholders.faq")}
              />
            </FormField>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("visualTitle")}</CardTitle>
          <CardDescription>{t("visualDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          <FormField
            htmlFor="whatsappPhone"
            label={t("fields.whatsappPhone")}
            error={state.fieldErrors?.whatsappPhone}
          >
            <Input
              {...fieldProps("whatsappPhone")}
              type="tel"
              dir="ltr"
              defaultValue={profile.whatsappPhone}
              placeholder={t("placeholders.phone")}
            />
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("seoTitle")}</CardTitle>
          <CardDescription>{t("seoDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          <FormField
            htmlFor="seoTitle"
            label={t("fields.seoTitle")}
            error={state.fieldErrors?.seoTitle}
          >
            <Input
              {...fieldProps("seoTitle")}
              defaultValue={profile.seoTitle}
              maxLength={70}
            />
          </FormField>
          <div className="md:col-span-2">
            <FormField
              htmlFor="seoDescription"
              label={t("fields.seoDescription")}
              error={state.fieldErrors?.seoDescription}
            >
              <Textarea
                {...fieldProps("seoDescription")}
                defaultValue={profile.seoDescription}
                maxLength={180}
              />
            </FormField>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("contactTitle")}</CardTitle>
          <CardDescription>{t("contactDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          <FormField
            htmlFor="businessEmail"
            label={t("fields.businessEmail")}
            error={state.fieldErrors?.businessEmail}
          >
            <Input
              {...fieldProps("businessEmail")}
              type="email"
              autoComplete="email"
              defaultValue={profile.businessEmail}
              placeholder={t("placeholders.email")}
            />
          </FormField>

          <FormField
            htmlFor="businessPhone"
            label={t("fields.businessPhone")}
            error={state.fieldErrors?.businessPhone}
          >
            <Input
              {...fieldProps("businessPhone")}
              type="tel"
              autoComplete="tel"
              defaultValue={profile.businessPhone}
              placeholder={t("placeholders.phone")}
            />
          </FormField>

          <FormField
            htmlFor="website"
            label={t("fields.website")}
            error={state.fieldErrors?.website}
          >
            <Input
              {...fieldProps("website")}
              type="url"
              defaultValue={profile.website}
              placeholder={t("placeholders.website")}
            />
          </FormField>

          {(
            [
              "facebookUrl",
              "instagramUrl",
              "tiktokUrl",
              "youtubeUrl",
            ] as const
          ).map((field) => (
            <FormField
              key={field}
              htmlFor={field}
              label={t(`fields.${field}`)}
              error={state.fieldErrors?.[field]}
            >
              <Input
                {...fieldProps(field)}
                type="url"
                defaultValue={profile[field]}
                placeholder={t("placeholders.social")}
              />
            </FormField>
          ))}
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p
          aria-live="polite"
          className={
            state.status === "error"
              ? "text-sm text-destructive"
              : "text-sm text-muted-foreground"
          }
        >
          {state.message}
        </p>
        {profile.canEdit ? (
          <Button type="submit" disabled={pending}>
            {pending ? (
              <LoaderCircle className="animate-spin" aria-hidden="true" />
            ) : (
              <Save aria-hidden="true" />
            )}
            {pending ? common("saving") : common("saveChanges")}
          </Button>
        ) : (
          <span className="text-sm text-muted-foreground">
            {common("readOnly")}
          </span>
        )}
      </div>
    </form>
  );
}
