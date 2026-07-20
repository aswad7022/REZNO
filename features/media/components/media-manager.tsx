"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, LoaderCircle, Trash2, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Binding = {
  altText: string | null;
  id: string;
  media: { assetId: string; stableDeliveryPath: string } | null;
  slot: string;
  sortOrder: number | null;
  variantId: string | null;
};
type Container = { bindings: Binding[]; id: string | null; version: number };
type Capability = { directUploadAvailable: boolean; providerConfigured: boolean; supportedMimeTypes: string[] };

let capabilityLoad: Promise<Capability> | null = null;

export function MediaManager({
  collection = false,
  description,
  deferLoad = false,
  endpoint,
  purpose,
  reorderEndpoint,
  slot,
  storageMode,
  title,
  variants = [],
}: {
  collection?: boolean;
  description: string;
  deferLoad?: boolean;
  endpoint: string;
  purpose: string;
  reorderEndpoint?: string;
  slot: string;
  storageMode: "business" | "customer";
  title: string;
  variants?: ReadonlyArray<{ id: string; title: string }>;
}) {
  const t = useTranslations("Media");
  const [container, setContainer] = useState<Container | null>(null);
  const [capability, setCapability] = useState<Capability | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [altText, setAltText] = useState("");
  const [variantId, setVariantId] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [activated, setActivated] = useState(!deferLoad);
  const bindings = useMemo(
    () => (container?.bindings ?? []).filter((binding) => binding.slot === slot),
    [container, slot],
  );
  const messageId = `media-message-${slot}`;

  useEffect(() => {
    if (!activated) return;
    let live = true;
    capabilityLoad ??= loadData<Capability>("/api/media/capabilities");
    Promise.all([loadData<Container>(endpoint), capabilityLoad]).then(([nextContainer, nextCapability]) => {
      if (live) {
        setContainer(nextContainer);
        setCapability(nextCapability);
      }
    }).catch(() => live && setMessage(t("genericError")));
    return () => { live = false; };
  }, [activated, endpoint, t]);

  async function upload() {
    if (!file || !container || !capability?.directUploadAvailable) return;
    setPending(true);
    setMessage(t("selecting"));
    try {
      if (!capability.supportedMimeTypes.includes(file.type)) throw new Error("UNSUPPORTED_MEDIA_TYPE");
      const session = await mutate<{ id: string; version: number }>(
        `/api/storage/${storageMode}/sessions`,
        "POST",
        { displayName: file.name, expectedMimeType: file.type, expectedSizeBytes: file.size, purpose },
      );
      setMessage(t("uploadTarget"));
      const target = await mutate<{
        headers: Record<string, string>;
        method: "PUT";
        sessionVersion: number;
        url: string;
      }>(`/api/storage/${storageMode}/sessions/${session.id}/target`, "POST", { expectedVersion: session.version });
      setMessage(t("uploading"));
      const uploadResponse = await fetch(target.url, { body: file, headers: target.headers, method: target.method });
      if (!uploadResponse.ok) throw new Error("STORAGE_PROVIDER_FAILURE");
      setMessage(t("finalizing"));
      const finalized = await mutate<{ asset: { id: string; state: string } }>(
        `/api/storage/${storageMode}/sessions/${session.id}/finalize`,
        "POST",
        { expectedVersion: target.sessionVersion },
      );
      if (finalized.asset.state !== "READY") throw new Error(finalized.asset.state);
      setMessage(t(bindings.length > 0 && !collection ? "replacing" : "attaching"));
      const next = await mutate<Container>(endpoint, bindings.length > 0 && !collection ? "PUT" : "POST", {
        altText,
        assetId: finalized.asset.id,
        expectedVersion: container.version,
        productVariantId: variantId || null,
        slot,
      });
      updateContainer(next);
      setFile(null);
      setAltText("");
      setVariantId("");
      setMessage(t("saved"));
    } catch (error) {
      setMessage(errorMessage(error, t));
    } finally {
      setPending(false);
    }
  }

  async function detach(binding: Binding) {
    if (!container) return;
    setPending(true);
    setMessage(t("deleting"));
    try {
      const next = await mutate<Container>(`${endpoint}/bindings/${binding.id}`, "DELETE", {
        expectedVersion: container.version,
        slot,
      });
      updateContainer(next);
      setMessage(t("saved"));
    } catch (error) {
      setMessage(errorMessage(error, t));
    } finally { setPending(false); }
  }

  async function saveAlt(binding: Binding, value: string) {
    if (!container) return;
    setPending(true);
    try {
      const next = await mutate<Container>(`${endpoint}/bindings/${binding.id}`, "PATCH", {
        altText: value,
        expectedVersion: container.version,
        slot,
      });
      updateContainer(next);
      setMessage(t("saved"));
    } catch (error) { setMessage(errorMessage(error, t)); }
    finally { setPending(false); }
  }

  async function move(index: number, direction: -1 | 1) {
    if (!container || !reorderEndpoint) return;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= bindings.length) return;
    const order = bindings.map((binding) => binding.id);
    [order[index], order[nextIndex]] = [order[nextIndex]!, order[index]!];
    setPending(true);
    try {
      const next = await mutate<Container>(reorderEndpoint, "POST", {
        bindingIds: order,
        expectedVersion: container.version,
        slot,
      });
      updateContainer(next);
      setMessage(t("saved"));
    } catch (error) { setMessage(errorMessage(error, t)); }
    finally { setPending(false); }
  }

  function updateContainer(next: Container) {
    setContainer(next);
  }

  if (!activated) return <section className="space-y-3 rounded-xl border p-4">
    <div><h3 className="font-semibold">{title}</h3><p className="text-sm text-muted-foreground">{description}</p></div>
    <Button type="button" variant="outline" onClick={() => setActivated(true)}>{t("manage")}</Button>
  </section>;
  const unavailable = capability && !capability.providerConfigured;
  return <section className="space-y-4 rounded-xl border p-4" aria-busy={pending}>
    <div>
      <h3 className="font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
    {unavailable ? <p className="rounded-md bg-muted p-3 text-sm" role="status">{t("uploadUnavailable")}</p> : null}
    {bindings.length === 0 ? <p className="text-sm text-muted-foreground">{collection ? t("emptyGallery") : t("empty")}</p> : null}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {bindings.map((binding, index) => <article key={binding.id} className="space-y-3 rounded-lg border p-3">
        {binding.media ? <Image className="aspect-video w-full rounded-md object-cover" src={storageMode === "business" ? `/api/media/business/assets/${binding.media.assetId}` : binding.media.stableDeliveryPath} alt={binding.altText ?? ""} width={640} height={360} /> : <div className="aspect-video rounded-md bg-muted" />}
        <div className="space-y-1">
          <Label htmlFor={`media-alt-${binding.id}`}>{t("altText")}</Label>
          <Input id={`media-alt-${binding.id}`} aria-describedby={messageId} defaultValue={binding.altText ?? ""} maxLength={300} disabled={pending} onBlur={(event) => {
            if (event.currentTarget.value !== (binding.altText ?? "")) void saveAlt(binding, event.currentTarget.value);
          }} />
        </div>
        <div className="flex flex-wrap gap-2">
          {collection && reorderEndpoint ? <>
            <Button type="button" size="icon" variant="outline" disabled={pending || index === 0} onClick={() => void move(index, -1)} aria-label={t("moveUp")}><ArrowUp /></Button>
            <Button type="button" size="icon" variant="outline" disabled={pending || index === bindings.length - 1} onClick={() => void move(index, 1)} aria-label={t("moveDown")}><ArrowDown /></Button>
          </> : null}
          <Button type="button" variant="destructive" disabled={pending} onClick={() => void detach(binding)}><Trash2 />{t("delete")}</Button>
        </div>
      </article>)}
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1">
        <Label htmlFor={`media-file-${slot}`}>{t("file")}</Label>
        <Input id={`media-file-${slot}`} aria-describedby={messageId} type="file" accept="image/jpeg,image/png,image/webp" disabled={pending || !capability?.directUploadAvailable} onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`media-new-alt-${slot}`}>{t("altText")}</Label>
        <Input id={`media-new-alt-${slot}`} aria-describedby={messageId} value={altText} maxLength={300} disabled={pending || !capability?.directUploadAvailable} onChange={(event) => setAltText(event.target.value)} />
      </div>
      {variants.length > 0 ? <div className="space-y-1">
        <Label htmlFor={`media-variant-${slot}`}>{t("variant")}</Label>
        <select id={`media-variant-${slot}`} className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={variantId} disabled={pending} onChange={(event) => setVariantId(event.target.value)}>
          <option value="">{t("allVariants")}</option>
          {variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.title}</option>)}
        </select>
      </div> : null}
      <div className="flex items-end">
        <Button type="button" disabled={pending || !file || !capability?.directUploadAvailable} onClick={() => void upload()}>
          {pending ? <LoaderCircle className="animate-spin" /> : <Upload />}{bindings.length > 0 && !collection ? t("replace") : t("upload")}
        </Button>
      </div>
    </div>
    <p id={messageId} className="text-sm text-muted-foreground" aria-live="polite">{message}</p>
  </section>;
}

async function loadData<T>(url: string) {
  const response = await fetch(url, { cache: "no-store", credentials: "same-origin" });
  return responseData<T>(response);
}

async function mutate<T>(url: string, method: string, body: unknown) {
  const response = await fetch(url, {
    body: JSON.stringify(body),
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
    method,
  });
  return responseData<T>(response);
}

async function responseData<T>(response: Response): Promise<T> {
  const payload = await response.json() as { data?: T; error?: { code?: string; message?: string } };
  if (!response.ok || !payload.data) throw new Error(payload.error?.code ?? "MEDIA_ERROR");
  return payload.data;
}

function errorMessage(error: unknown, t: ReturnType<typeof useTranslations<"Media">>) {
  const code = error instanceof Error ? error.message : "";
  if (code === "STALE_VERSION") return t("staleVersion");
  if (code === "STORAGE_QUOTA_EXCEEDED") return t("quotaExceeded");
  if (code === "UNSUPPORTED_MEDIA_TYPE") return t("unsupportedFile");
  if (code === "FILE_TOO_LARGE") return t("fileTooLarge");
  if (code === "REJECTED") return t("mediaRejected");
  if (code === "QUARANTINED") return t("mediaQuarantined");
  if (code === "STORAGE_PROVIDER_NOT_CONFIGURED") return t("uploadUnavailable");
  return t("genericError");
}
