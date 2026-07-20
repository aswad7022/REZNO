import * as Crypto from "expo-crypto";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import { mobileApiRequest, MobileApiRequestError } from "../api/client";
import type { MobileLocale } from "../i18n/labels";

type Data<T> = { data: T };
type Container = {
  bindings: Array<{
    id: string;
    media: { assetId: string | null } | null;
    slot: string;
  }>;
  version: number;
};

const copy = {
  ar: {
    add: "اختيار صورة",
    avatarLabel: "صورة الحساب",
    attaching: "جارٍ ربط الصورة بالحساب…",
    deleting: "جارٍ إزالة الصورة…",
    fileTooLarge: "حجم الصورة أكبر من الحد المسموح.",
    finalizing: "جارٍ فحص الصورة وإنهاء الرفع…",
    unavailable: "رفع الصورة غير متاح لأن التخزين المُدار غير مهيأ.",
    loading: "جارٍ تحميل صورة الحساب…",
    uploading: "جارٍ رفع الصورة وفحصها…",
    uploadTarget: "جارٍ إعداد مسار الرفع الآمن…",
    quota: "تم بلوغ حد تخزين صور الحساب.",
    rejected: "رُفضت الصورة لأسباب أمنية.",
    replace: "استبدال الصورة",
    remove: "إزالة الصورة",
    retry: "حدّث البيانات ثم حاول مجددًا.",
    selecting: "جارٍ اختيار الصورة…",
    stale: "تغيّرت الصورة في جلسة أخرى. حدّث البيانات وحاول مجددًا.",
    quarantined: "الصورة قيد الحجر الأمني ولا يمكن استخدامها.",
    unsupported: "اختر صورة JPEG أو PNG أو WebP.",
    error: "تعذر إكمال عملية الصورة بأمان.",
    permission: "يلزم السماح بالوصول إلى مكتبة الصور.",
  },
  en: {
    add: "Choose image",
    avatarLabel: "Account avatar",
    attaching: "Attaching the avatar to your account…",
    deleting: "Removing the avatar…",
    fileTooLarge: "The selected image exceeds the allowed size.",
    finalizing: "Inspecting and finalizing the upload…",
    unavailable: "Avatar upload is unavailable because managed storage is not configured.",
    loading: "Loading account avatar…",
    uploading: "Uploading and checking the image…",
    uploadTarget: "Preparing a secure upload target…",
    quota: "The account-avatar storage limit has been reached.",
    rejected: "The image was rejected for security reasons.",
    replace: "Replace image",
    remove: "Remove image",
    retry: "Refresh the data and try again.",
    selecting: "Selecting an image…",
    stale: "The avatar changed in another session. Refresh and try again.",
    quarantined: "The image is quarantined and cannot be used.",
    unsupported: "Choose a JPEG, PNG, or WebP image.",
    error: "The avatar operation could not be completed safely.",
    permission: "Photo-library access is required.",
  },
  ckb: {
    add: "وێنە هەڵبژێرە",
    avatarLabel: "وێنەی هەژمار",
    attaching: "وێنەکە بە هەژمارەکەتەوە دەبەسترێت…",
    deleting: "وێنەکە لادەبرێت…",
    fileTooLarge: "قەبارەی وێنەکە لە سنووری ڕێگەپێدراو زیاترە.",
    finalizing: "وێنەکە پشکنین و بارکردنەکە تەواو دەکرێت…",
    unavailable: "بارکردنی وێنە بەردەست نییە چونکە هەڵگرتن ڕێک نەخراوە.",
    loading: "وێنەی هەژمار بار دەکرێت…",
    uploading: "وێنەکە باردەکرێت و پشکنین دەکرێت…",
    uploadTarget: "ڕێگایەکی پارێزراوی بارکردن ئامادە دەکرێت…",
    quota: "سنووری هەڵگرتنی وێنەی هەژمار پڕ بووە.",
    rejected: "وێنەکە بەهۆی هۆکاری ئاسایشی ڕەتکرایەوە.",
    replace: "گۆڕینی وێنە",
    remove: "لابردنی وێنە",
    retry: "داتاکان نوێ بکەرەوە و دووبارە هەوڵ بدە.",
    selecting: "وێنە هەڵدەبژێردرێت…",
    stale: "وێنەکە لە دانیشتنێکی تر گۆڕاوە. نوێ بکەرەوە و دووبارە هەوڵ بدە.",
    quarantined: "وێنەکە لە قرنطینەدایە و ناتوانرێت بەکاربهێنرێت.",
    unsupported: "وێنەی JPEG یان PNG یان WebP هەڵبژێرە.",
    error: "کرداری وێنە بە سەلامەتی تەواو نەبوو.",
    permission: "ڕێگەدان بە گەیشتن بە کتێبخانەی وێنە پێویستە.",
  },
} as const;

export function CustomerAvatarManager({ locale }: { locale: MobileLocale }) {
  const labels = copy[locale];
  const [container, setContainer] = useState<Container | null>(null);
  const [providerConfigured, setProviderConfigured] = useState<boolean | null>(null);
  const [maximumBytes, setMaximumBytes] = useState<number | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>(labels.loading);
  const binding = container?.bindings.find((item) => item.slot === "CUSTOMER_AVATAR") ?? null;

  useEffect(() => {
    let live = true;
    Promise.all([
      mobileApiRequest<Data<Container>>("/api/media/customer/profile", { authenticated: true }),
      mobileApiRequest<Data<{ maximumSizeByPurpose: Record<string, number>; providerConfigured: boolean }>>("/api/media/capabilities"),
    ]).then(async ([media, capabilities]) => {
      if (!live) return;
      setContainer(media.data);
      setProviderConfigured(capabilities.data.providerConfigured);
      setMaximumBytes(capabilities.data.maximumSizeByPurpose.CUSTOMER_AVATAR ?? null);
      const current = media.data.bindings.find((item) => item.slot === "CUSTOMER_AVATAR");
      const assetId = current?.media?.assetId;
      if (assetId) {
        const download = await mobileApiRequest<Data<{ url: string }>>(
          `/api/storage/customer/assets/${encodeURIComponent(assetId)}/download`,
          { authenticated: true },
        );
        if (live) setAvatarUrl(download.data.url);
      }
      if (live) setMessage(capabilities.data.providerConfigured ? "" : labels.unavailable);
    }).catch(() => live && setMessage(labels.error));
    return () => { live = false; };
  }, [labels.error, labels.unavailable]);

  async function chooseAndUpload() {
    if (!container || !providerConfigured) return;
    setMessage(labels.selecting);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setMessage(labels.permission);
      return;
    }
    const selection = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      mediaTypes: ["images"],
      quality: 1,
      selectionLimit: 1,
    });
    if (selection.canceled || !selection.assets[0]) return;
    const selected = selection.assets[0];
    const mimeType = selected.mimeType;
    const size = selected.fileSize;
    if (!mimeType || !["image/jpeg", "image/png", "image/webp"].includes(mimeType) || !size) {
      setMessage(labels.unsupported);
      return;
    }
    if (maximumBytes && size > maximumBytes) {
      setMessage(labels.fileTooLarge);
      return;
    }
    setPending(true);
    setMessage(labels.uploadTarget);
    try {
      const session = await mutate<{ id: string; version: number }>("/api/storage/customer/sessions", "POST", {
        displayName: selected.fileName ?? "avatar",
        expectedMimeType: mimeType,
        expectedSizeBytes: size,
        purpose: "CUSTOMER_AVATAR",
      });
      const target = await mutate<{ headers: Record<string, string>; method: "PUT"; sessionVersion: number; url: string }>(
        `/api/storage/customer/sessions/${session.id}/target`, "POST", { expectedVersion: session.version },
      );
      setMessage(labels.uploading);
      const blob = await (await fetch(selected.uri)).blob();
      const uploaded = await fetch(target.url, { body: blob, headers: target.headers, method: target.method });
      if (!uploaded.ok) throw new Error("UPLOAD_FAILED");
      setMessage(labels.finalizing);
      const finalized = await mutate<{ asset: { id: string; state: string } }>(
        `/api/storage/customer/sessions/${session.id}/finalize`, "POST", { expectedVersion: target.sessionVersion },
      );
      if (finalized.asset.state !== "READY") throw new MobileApiRequestError(finalized.asset.state, 409, finalized.asset.state);
      setMessage(labels.attaching);
      const next = await mutate<Container>("/api/media/customer/profile", binding ? "PUT" : "POST", {
        altText: null,
        assetId: finalized.asset.id,
        expectedVersion: container.version,
        productVariantId: null,
        slot: "CUSTOMER_AVATAR",
      });
      setContainer(next);
      const download = await mobileApiRequest<Data<{ url: string }>>(
        `/api/storage/customer/assets/${encodeURIComponent(finalized.asset.id)}/download`,
        { authenticated: true },
      );
      setAvatarUrl(download.data.url);
      setMessage("");
    } catch (error) {
      setMessage(mobileErrorMessage(error, labels));
    } finally { setPending(false); }
  }

  async function remove() {
    if (!container || !binding) return;
    setPending(true);
    setMessage(labels.deleting);
    try {
      const next = await mutate<Container>(`/api/media/customer/profile/bindings/${binding.id}`, "DELETE", {
        expectedVersion: container.version,
        slot: "CUSTOMER_AVATAR",
      });
      setContainer(next);
      setAvatarUrl(null);
      setMessage("");
    } catch { setMessage(labels.error); }
    finally { setPending(false); }
  }

  return <View style={styles.card} accessibilityLiveRegion="polite">
    {avatarUrl ? <Image accessibilityLabel={labels.avatarLabel} alt={labels.avatarLabel} source={{ uri: avatarUrl }} style={styles.avatar} /> : null}
    <View style={styles.actions}>
      <Pressable accessibilityRole="button" accessibilityState={{ busy: pending, disabled: pending || !providerConfigured }} disabled={pending || !providerConfigured} onPress={() => void chooseAndUpload()} style={styles.primary}>
        <Text style={styles.primaryText}>{binding ? labels.replace : labels.add}</Text>
      </Pressable>
      {binding ? <Pressable accessibilityRole="button" accessibilityState={{ busy: pending, disabled: pending }} disabled={pending} onPress={() => void remove()} style={styles.secondary}>
        <Text style={styles.secondaryText}>{labels.remove}</Text>
      </Pressable> : null}
    </View>
    {message ? <Text style={styles.message}>{message}</Text> : null}
  </View>;
}

async function mutate<T>(path: string, method: "DELETE" | "POST" | "PUT", body: unknown) {
  const response = await mobileApiRequest<Data<T>>(path, {
    authenticated: true,
    body,
    headers: { "Idempotency-Key": Crypto.randomUUID() },
    method,
  });
  return response.data;
}

function mobileErrorMessage(error: unknown, labels: typeof copy[MobileLocale]) {
  if (!(error instanceof MobileApiRequestError)) return labels.error;
  if (error.code === "STORAGE_PROVIDER_NOT_CONFIGURED") return labels.unavailable;
  if (error.code === "STORAGE_QUOTA_EXCEEDED") return labels.quota;
  if (error.code === "UNSUPPORTED_MEDIA_TYPE") return labels.unsupported;
  if (error.code === "FILE_TOO_LARGE") return labels.fileTooLarge;
  if (error.code === "REJECTED") return labels.rejected;
  if (error.code === "QUARANTINED") return labels.quarantined;
  if (error.code === "STALE_VERSION") return labels.stale;
  if (error.code === "RATE_LIMITED") return labels.retry;
  return labels.error;
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  avatar: { borderRadius: 48, height: 96, width: 96 },
  card: { borderColor: "rgba(120,120,120,0.25)", borderRadius: 18, borderWidth: 1, gap: 12, marginTop: 16, padding: 14 },
  message: { color: "#6b7280", fontSize: 13, lineHeight: 20 },
  primary: { backgroundColor: "#7c3aed", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  primaryText: { color: "#ffffff", fontWeight: "700" },
  secondary: { borderColor: "#ef4444", borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
  secondaryText: { color: "#ef4444", fontWeight: "700" },
});
