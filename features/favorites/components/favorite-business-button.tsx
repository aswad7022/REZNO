"use client";

import Link from "next/link";
import { MouseEvent, useState, useTransition } from "react";
import { Heart } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  toggleFavoriteBusinessById,
} from "@/features/favorites/actions/favorites";
import { cn } from "@/lib/utils";

export function FavoriteBusinessButton({
  organizationId,
  initialFavorited,
  canToggle,
  compact = false,
  onChange,
}: {
  organizationId: string;
  initialFavorited: boolean;
  canToggle: boolean;
  compact?: boolean;
  onChange?: (isFavorited: boolean) => void;
}) {
  const t = useTranslations("Favorites");
  const [isPending, startTransition] = useTransition();
  const [isFavorited, setIsFavorited] = useState(initialFavorited);
  const [error, setError] = useState<string | null>(null);
  const label = isFavorited ? t("removeFromFavorites") : t("addToFavorites");

  const handleToggle = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    if (isPending) return;

    const previous = isFavorited;
    const optimistic = !previous;
    setIsFavorited(optimistic);
    setError(null);

    startTransition(async () => {
      const result = await toggleFavoriteBusinessById(organizationId);

      if (result.status === "error" || typeof result.isFavorited !== "boolean") {
        setIsFavorited(previous);
        setError(result.message ?? t("couldNotUpdate"));
        return;
      }

      setIsFavorited(result.isFavorited);
      onChange?.(result.isFavorited);
    });
  };

  if (!canToggle) {
    return (
      <Button asChild size={compact ? "icon" : "sm"} variant="outline">
        <Link
          aria-label={t("signInToSave")}
          href="/register?mode=signin"
          title={t("signInToSave")}
        >
          <Heart className="size-4" aria-hidden="true" />
          {compact ? <span className="sr-only">{t("signInToSave")}</span> : t("favorite")}
        </Link>
      </Button>
    );
  }

  return (
    <>
      <Button
        aria-label={label}
        className={cn(
          isFavorited &&
            "border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300",
        )}
        disabled={isPending}
        onClick={handleToggle}
        size={compact ? "icon" : "sm"}
        title={label}
        type="button"
        variant="outline"
      >
        <Heart
          className={cn("size-4", isFavorited && "fill-current")}
          aria-hidden="true"
        />
        {compact ? <span className="sr-only">{label}</span> : label}
      </Button>
      {error ? (
        <p className="sr-only" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}
