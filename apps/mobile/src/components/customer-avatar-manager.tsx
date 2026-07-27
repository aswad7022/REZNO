import * as ImagePicker from "expo-image-picker";
import { useEffect, useMemo, useState } from "react";
import {
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type { MobileLocale } from "../i18n/labels";
import type { MobileTheme } from "../theme/tokens";
import type {
  CustomerAvatarCoordinatorStatus,
} from "../media/upload-coordinator";
import {
  customerAvatarUploadCoordinator,
} from "../media/upload-coordinator-runtime";
import {
  firstSelectedImage,
  mediaPermissionDisposition,
} from "../media/upload-policy";

const copy = {
  ar: {
    addCamera: "التقاط صورة",
    addLibrary: "اختيار من المكتبة",
    avatarLabel: "صورة الحساب",
    cancelOperation: "إلغاء الرفع",
    cancelled: "أُلغيت عملية الصورة ونُظفت الملفات المؤقتة.",
    cancelling: "جارٍ إلغاء الرفع وتنظيف الملفات…",
    cameraPermission: "يلزم السماح باستخدام الكاميرا لالتقاط صورة.",
    cleanupFailed: "تعذر تنظيف بيانات الصورة الخاصة بالكامل. أعد المحاولة لإكمال التنظيف بأمان.",
    commitUnconfirmed: "قد يكون تحديث الصورة اكتمل. تعذر التحقق الآن، فبقيت العملية محفوظة للتحقق لاحقًا.",
    deleting: "جارٍ إزالة الصورة…",
    destinationChanged: "تغيّرت صورة الحساب أثناء الاستعادة، لذلك لم تُستبدل.",
    duplicate: "عملية رفع الصورة نفسها قيد التنفيذ بالفعل.",
    error: "تعذر إكمال عملية الصورة بأمان.",
    expired: "انتهت صلاحية عملية الرفع القديمة ونُظفت بأمان.",
    fileTooLarge: "حجم الصورة أكبر من الحد المسموح.",
    loading: "جارٍ تحميل صورة الحساب…",
    maxRetries: "توقفت المحاولات بعد بلوغ الحد الآمن. يمكنك إلغاء العملية.",
    normalizing: "جارٍ فحص الصورة وإزالة بيانات الموقع وتهيئتها…",
    offline: "لا يوجد اتصال. بقيت العملية محفوظة ويمكن استئنافها.",
    openSettings: "فتح الإعدادات",
    permissionBlocked: "الصلاحية مرفوضة نهائيًا. فعّلها من إعدادات الجهاز.",
    pickerCancelled: "لم تُختر صورة.",
    processingRecovered: "جارٍ استعادة الصورة التي أعاد Android تسليمها…",
    progress: "تقدم الرفع",
    previewUnavailable: "تم تحديث صورة الحساب، لكن تعذر تحميل المعاينة الآن. يمكنك إعادة تحميلها دون رفع الصورة مجددًا.",
    quota: "تم بلوغ حد تخزين صور الحساب.",
    quarantined: "الصورة قيد الحجر الأمني ولا يمكن استخدامها.",
    rejected: "رُفضت الصورة لأسباب أمنية.",
    remove: "إزالة الصورة",
    refreshPreview: "إعادة تحميل المعاينة",
    refreshingPreview: "جارٍ إعادة تحميل معاينة الصورة…",
    retry: "إعادة المحاولة",
    retryable: "تعذر الرفع مؤقتًا. بقيت العملية محفوظة لإعادة المحاولة.",
    stale: "تغيّرت الصورة في جلسة أخرى. لم يُستبدل المحتوى الأحدث.",
    success: "تم تحديث صورة الحساب بنجاح.",
    timeout: "انتهت مهلة الشبكة. بقيت العملية محفوظة لإعادة المحاولة.",
    unavailable: "رفع الصورة غير متاح لأن التخزين المُدار غير مهيأ.",
    unsafeFile: "محتوى الملف لا يطابق صورة معتمدة.",
    unsupported: "اختر صورة JPEG أو PNG أو WebP أو HEIC/HEIF.",
    uploading: "جارٍ رفع الصورة وفحصها…",
    verifyingCommit: "أُرسل ربط الصورة بالفعل. جارٍ التحقق من النتيجة بدل ادعاء الإلغاء…",
    libraryPermission: "يلزم السماح بالوصول إلى مكتبة الصور.",
  },
  en: {
    addCamera: "Take photo",
    addLibrary: "Choose from library",
    avatarLabel: "Account avatar",
    cancelOperation: "Cancel upload",
    cancelled: "The image operation was cancelled and temporary files were cleaned.",
    cancelling: "Cancelling the upload and cleaning temporary files…",
    cameraPermission: "Camera access is required to take a photo.",
    cleanupFailed: "Private image state could not be fully cleaned. Retry to finish cleanup safely.",
    commitUnconfirmed: "The avatar update may have completed. It could not be verified now, so the operation remains saved for later verification.",
    deleting: "Removing the avatar…",
    destinationChanged: "The account avatar changed during recovery, so it was not replaced.",
    duplicate: "This image upload is already running.",
    error: "The avatar operation could not be completed safely.",
    expired: "The old upload expired and was cleaned safely.",
    fileTooLarge: "The selected image exceeds the allowed size.",
    loading: "Loading account avatar…",
    maxRetries: "Retries stopped at the safe limit. You can cancel the operation.",
    normalizing: "Checking the image, removing location metadata, and preparing it…",
    offline: "You are offline. The operation is saved and can be resumed.",
    openSettings: "Open settings",
    permissionBlocked: "Permission is blocked. Enable it in device settings.",
    pickerCancelled: "No image was selected.",
    processingRecovered: "Recovering the image returned by Android…",
    progress: "Upload progress",
    previewUnavailable: "The account avatar was updated, but its preview is temporarily unavailable. Reload it without uploading again.",
    quota: "The account-avatar storage limit has been reached.",
    quarantined: "The image is quarantined and cannot be used.",
    rejected: "The image was rejected for security reasons.",
    remove: "Remove image",
    refreshPreview: "Reload preview",
    refreshingPreview: "Reloading the avatar preview…",
    retry: "Retry",
    retryable: "The upload failed temporarily. It remains saved for a safe retry.",
    stale: "The avatar changed in another session. Newer content was not replaced.",
    success: "The account avatar was updated successfully.",
    timeout: "The network timed out. The operation remains saved for a retry.",
    unavailable: "Avatar upload is unavailable because managed storage is not configured.",
    unsafeFile: "The file content is not a supported image.",
    unsupported: "Choose a JPEG, PNG, WebP, or HEIC/HEIF image.",
    uploading: "Uploading and checking the image…",
    verifyingCommit: "The avatar attach was already sent. Verifying its result instead of claiming cancellation…",
    libraryPermission: "Photo-library access is required.",
  },
  ckb: {
    addCamera: "وێنە بگرە",
    addLibrary: "لە کتێبخانە هەڵبژێرە",
    avatarLabel: "وێنەی هەژمار",
    cancelOperation: "هەڵوەشاندنەوەی بارکردن",
    cancelled: "کرداری وێنە هەڵوەشایەوە و فایلە کاتییەکان پاککرانەوە.",
    cancelling: "بارکردن هەڵدەوەشێتەوە و فایلە کاتییەکان پاکدەکرێنەوە…",
    cameraPermission: "بۆ وێنەگرتن ڕێگەدان بە کامێرا پێویستە.",
    cleanupFailed: "دۆخی تایبەتی وێنەکە بە تەواوی پاک نەکرایەوە. بۆ پاککردنەوەی پارێزراو دووبارە هەوڵبدە.",
    commitUnconfirmed: "لەوانەیە نوێکردنەوەی وێنەکە تەواوبووبێت. ئێستا پشتڕاست نەکرایەوە، بۆیە کردارەکە بۆ پشکنینی دواتر هەڵگیراوە.",
    deleting: "وێنەکە لادەبرێت…",
    destinationChanged: "وێنەی هەژمار لە کاتی گەڕاندنەوەدا گۆڕا، بۆیە جێگۆڕکێی پێ نەکرا.",
    duplicate: "هەمان کرداری بارکردنی وێنە ئێستا بەردەوامە.",
    error: "کرداری وێنە بە سەلامەتی تەواو نەبوو.",
    expired: "ماوەی بارکردنە کۆنەکە تەواو بوو و بە سەلامەتی پاککرایەوە.",
    fileTooLarge: "قەبارەی وێنەکە لە سنووری ڕێگەپێدراو زیاترە.",
    loading: "وێنەی هەژمار بار دەکرێت…",
    maxRetries: "هەوڵەکان لە سنووری پارێزراودا وەستان. دەتوانیت کردارەکە هەڵبوەشێنیتەوە.",
    normalizing: "وێنەکە پشکنین دەکرێت و زانیاری شوێن پاکدەکرێتەوە…",
    offline: "ئینتەرنێت نییە. کردارەکە پارێزراوە و دەتوانرێت بەردەوام بکرێت.",
    openSettings: "کردنەوەی ڕێکخستنەکان",
    permissionBlocked: "ڕێگەدان داخراوە. لە ڕێکخستنەکانی ئامێر چالاکی بکە.",
    pickerCancelled: "هیچ وێنەیەک هەڵنەبژێردرا.",
    processingRecovered: "وێنەی گەڕێندراوەی Android ئامادە دەکرێت…",
    progress: "پێشکەوتنی بارکردن",
    previewUnavailable: "وێنەی هەژمار نوێکرایەوە، بەڵام پێشبینینەکە ئێستا بەردەست نییە. بەبێ بارکردنەوەی دووبارە نوێی بکەرەوە.",
    quota: "سنووری هەڵگرتنی وێنەی هەژمار پڕ بووە.",
    quarantined: "وێنەکە لە قرنطینەدایە و ناتوانرێت بەکاربهێنرێت.",
    rejected: "وێنەکە بەهۆی هۆکاری ئاسایشی ڕەتکرایەوە.",
    remove: "لابردنی وێنە",
    refreshPreview: "نوێکردنەوەی پێشبینین",
    refreshingPreview: "پێشبینینی وێنەکە نوێدەکرێتەوە…",
    retry: "دووبارە هەوڵبدە",
    retryable: "بارکردن کاتییەکە سەرکەوتوو نەبوو. بۆ هەوڵێکی پارێزراو هەڵگیراوە.",
    stale: "وێنەکە لە دانیشتنێکی تر گۆڕاوە و ناوەڕۆکی نوێ جێگۆڕکێی پێ نەکرا.",
    success: "وێنەی هەژمار بە سەرکەوتوویی نوێکرایەوە.",
    timeout: "کاتی تۆڕ تەواو بوو. کردارەکە بۆ هەوڵدانەوە هەڵگیراوە.",
    unavailable: "بارکردنی وێنە بەردەست نییە چونکە هەڵگرتن ڕێک نەخراوە.",
    unsafeFile: "ناوەڕۆکی فایلەکە وێنەیەکی پشتپێبەستراو نییە.",
    unsupported: "وێنەی JPEG یان PNG یان WebP یان HEIC/HEIF هەڵبژێرە.",
    uploading: "وێنەکە باردەکرێت و پشکنین دەکرێت…",
    verifyingCommit: "داواکاری بەستنەوەی وێنەکە نێردراوە. لەبری بانگەشەی هەڵوەشاندنەوە، ئەنجامەکە پشتڕاست دەکرێتەوە…",
    libraryPermission: "ڕێگەدان بە گەیشتن بە کتێبخانەی وێنە پێویستە.",
  },
} as const;

type Labels = (typeof copy)[MobileLocale];

export function CustomerAvatarManager({
  isRtl,
  locale,
  ownerId,
  theme,
}: {
  isRtl: boolean;
  locale: MobileLocale;
  ownerId: string;
  theme: MobileTheme;
}) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  const labels = copy[locale];
  const [snapshot, setSnapshot] = useState(
    () => customerAvatarUploadCoordinator.getSnapshot(ownerId),
  );
  const [settingsRequired, setSettingsRequired] = useState(false);

  useEffect(() => {
    const unsubscribe = customerAvatarUploadCoordinator.subscribe(
      ownerId,
      setSnapshot,
    );
    void customerAvatarUploadCoordinator.bootstrap(ownerId);
    return unsubscribe;
  }, [ownerId]);

  const current = snapshot.ownerId === ownerId
    ? snapshot
    : customerAvatarUploadCoordinator.getSnapshot(ownerId);
  const binding =
    current.container?.bindings.find(
      (item) => item.slot === "CUSTOMER_AVATAR",
    ) ?? null;

  async function choose(source: "CAMERA" | "LIBRARY") {
    if (
      !current.container
      || current.providerConfigured !== true
      || !current.maximumBytes
      || current.pending
      || current.manifest
    ) {
      return;
    }
    setSettingsRequired(false);
    try {
      const permission =
        source === "CAMERA"
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      const permissionState = mediaPermissionDisposition(permission);
      if (permissionState !== "GRANTED") {
        const blocked = permissionState === "DENIED_BLOCKED";
        setSettingsRequired(blocked);
        customerAvatarUploadCoordinator.reportStatus(
          ownerId,
          blocked
            ? "PERMISSION_BLOCKED"
            : source === "CAMERA"
              ? "CAMERA_PERMISSION"
              : "LIBRARY_PERMISSION",
        );
        return;
      }
      const options: ImagePicker.ImagePickerOptions = {
        allowsEditing: false,
        base64: false,
        exif: false,
        mediaTypes: ["images"],
        quality: 1,
        selectionLimit: 1,
      };
      const selection =
        source === "CAMERA"
          ? await ImagePicker.launchCameraAsync({
              ...options,
              cameraType: ImagePicker.CameraType.back,
            })
          : await ImagePicker.launchImageLibraryAsync(options);
      const selectedAsset =
        firstSelectedImage<ImagePicker.ImagePickerAsset>(selection);
      if (!selectedAsset) {
        customerAvatarUploadCoordinator.reportStatus(
          ownerId,
          "PICKER_CANCELLED",
        );
        return;
      }
      await customerAvatarUploadCoordinator.prepareAndStart({
        asset: selectedAsset,
        ownerId,
        source,
      });
    } catch (error) {
      customerAvatarUploadCoordinator.reportError(ownerId, error);
    }
  }

  const newUploadDisabled =
    current.pending
    || Boolean(current.manifest)
    || current.providerConfigured !== true;
  const message = statusMessage(current.status, labels);
  const messageTone = statusTone(current.status);
  return (
    <View
      accessibilityLabel={labels.avatarLabel}
      accessibilityLiveRegion={messageTone === "danger" ? "assertive" : "polite"}
      style={styles.card}
    >
      {current.avatarUrl ? (
        <Image
          accessibilityLabel={labels.avatarLabel}
          alt={labels.avatarLabel}
          source={{ uri: current.avatarUrl }}
          style={styles.avatar}
        />
      ) : null}
      <View style={styles.actions}>
        <ActionButton
          disabled={newUploadDisabled}
          label={labels.addCamera}
          onPress={() => void choose("CAMERA")}
          primary
          styles={styles}
        />
        <ActionButton
          disabled={newUploadDisabled}
          label={labels.addLibrary}
          onPress={() => void choose("LIBRARY")}
          primary
          styles={styles}
        />
        {current.retryable && current.manifest ? (
          <ActionButton
            disabled={current.pending}
            label={labels.retry}
            onPress={() => void customerAvatarUploadCoordinator.retry(ownerId)}
            primary
            styles={styles}
          />
        ) : null}
        {current.manifest ? (
          <ActionButton
            disabled={false}
            destructive
            label={labels.cancelOperation}
            onPress={() => void customerAvatarUploadCoordinator.cancel(ownerId)}
            styles={styles}
          />
        ) : null}
        {current.previewAssetId ? (
          <ActionButton
            disabled={current.pending}
            label={labels.refreshPreview}
            onPress={() =>
              void customerAvatarUploadCoordinator.retryPreview(ownerId)}
            styles={styles}
          />
        ) : null}
        {binding ? (
          <ActionButton
            disabled={current.pending || Boolean(current.manifest)}
            destructive
            label={labels.remove}
            onPress={() => void customerAvatarUploadCoordinator.remove(ownerId)}
            styles={styles}
          />
        ) : null}
        {settingsRequired ? (
          <ActionButton
            disabled={false}
            label={labels.openSettings}
            onPress={() => void Linking.openSettings()}
            styles={styles}
          />
        ) : null}
      </View>
      {current.manifest || current.pending ? (
        <View
          accessibilityLabel={`${labels.progress}: ${Math.round(current.progress * 100)}%`}
          accessibilityRole="progressbar"
          accessibilityValue={{
            max: 100,
            min: 0,
            now: Math.round(current.progress * 100),
          }}
          style={styles.progressTrack}
        >
          <View
            style={[
              styles.progressFill,
              { width: `${Math.round(current.progress * 100)}%` },
            ]}
          />
        </View>
      ) : null}
      {message ? (
        <Text
          style={[
            styles.message,
            isRtl ? styles.rtlText : styles.ltrText,
            messageTone === "danger" && styles.messageDanger,
            messageTone === "success" && styles.messageSuccess,
            messageTone === "warning" && styles.messageWarning,
          ]}
        >
          {message}
        </Text>
      ) : null}
    </View>
  );
}

function statusMessage(
  status: CustomerAvatarCoordinatorStatus,
  labels: Labels,
) {
  const keys: Record<
    Exclude<CustomerAvatarCoordinatorStatus, "IDLE">,
    keyof Labels
  > = {
    CAMERA_PERMISSION: "cameraPermission",
    CANCELLED: "cancelled",
    CANCELLING: "cancelling",
    CLEANUP_FAILED: "cleanupFailed",
    COMMIT_UNCONFIRMED: "commitUnconfirmed",
    DELETING: "deleting",
    DESTINATION_CHANGED: "destinationChanged",
    DUPLICATE: "duplicate",
    ERROR: "error",
    EXPIRED: "expired",
    FILE_TOO_LARGE: "fileTooLarge",
    LIBRARY_PERMISSION: "libraryPermission",
    LOADING: "loading",
    MAX_RETRIES: "maxRetries",
    NORMALIZING: "normalizing",
    OFFLINE: "offline",
    PERMISSION_BLOCKED: "permissionBlocked",
    PICKER_CANCELLED: "pickerCancelled",
    PREVIEW_UNAVAILABLE: "previewUnavailable",
    PROCESSING_RECOVERED: "processingRecovered",
    QUARANTINED: "quarantined",
    QUOTA: "quota",
    REFRESHING_PREVIEW: "refreshingPreview",
    REJECTED: "rejected",
    RETRYABLE: "retryable",
    STALE: "stale",
    SUCCESS: "success",
    TIMEOUT: "timeout",
    UNAVAILABLE: "unavailable",
    UNSAFE_FILE: "unsafeFile",
    UNSUPPORTED: "unsupported",
    UPLOADING: "uploading",
    VERIFYING_COMMIT: "verifyingCommit",
  };
  return status === "IDLE" ? "" : labels[keys[status]];
}

function ActionButton({
  destructive = false,
  disabled,
  label,
  onPress,
  primary = false,
  styles,
}: {
  destructive?: boolean;
  disabled: boolean;
  label: string;
  onPress: () => void;
  primary?: boolean;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={onPress}
      style={[
        primary
          ? styles.primary
          : destructive
            ? styles.destructive
            : styles.secondary,
        disabled && styles.disabled,
      ]}
    >
      <Text
        style={
          primary
            ? styles.primaryText
            : destructive
              ? styles.destructiveText
              : styles.secondaryText
        }
      >
        {label}
      </Text>
    </Pressable>
  );
}

function statusTone(
  status: CustomerAvatarCoordinatorStatus,
): "danger" | "default" | "success" | "warning" {
  if (status === "SUCCESS") {
    return "success";
  }
  if (
    status === "ERROR"
    || status === "REJECTED"
    || status === "UNSAFE_FILE"
    || status === "CLEANUP_FAILED"
    || status === "FILE_TOO_LARGE"
    || status === "QUARANTINED"
    || status === "UNSUPPORTED"
  ) {
    return "danger";
  }
  if (
    status === "OFFLINE"
    || status === "TIMEOUT"
    || status === "RETRYABLE"
    || status === "COMMIT_UNCONFIRMED"
    || status === "PREVIEW_UNAVAILABLE"
    || status === "DESTINATION_CHANGED"
    || status === "EXPIRED"
    || status === "MAX_RETRIES"
    || status === "PERMISSION_BLOCKED"
    || status === "QUOTA"
    || status === "STALE"
  ) {
    return "warning";
  }
  return "default";
}

function createStyles(theme: MobileTheme) {
  return StyleSheet.create({
    actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    avatar: {
      borderColor: theme.colors.border,
      borderRadius: 48,
      borderWidth: 2,
      height: 96,
      width: 96,
    },
    card: {
      backgroundColor: theme.colors.card,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.card,
      borderWidth: 1,
      gap: 12,
      marginTop: theme.spacing.md,
      padding: theme.spacing.md,
    },
    disabled: { opacity: 0.45 },
    destructive: {
      alignItems: "center",
      borderColor: theme.colors.danger,
      borderRadius: theme.radii.control,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 44,
      minWidth: 44,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    destructiveText: { color: theme.colors.danger, fontWeight: "700" },
    ltrText: { textAlign: "left", writingDirection: "ltr" },
    message: {
      color: theme.colors.mutedForeground,
      fontSize: 13,
      lineHeight: 20,
    },
    messageDanger: { color: theme.colors.danger },
    messageSuccess: { color: theme.colors.success },
    messageWarning: { color: theme.colors.warning },
    primary: {
      alignItems: "center",
      backgroundColor: theme.colors.accent,
      borderRadius: theme.radii.control,
      justifyContent: "center",
      minHeight: 44,
      minWidth: 44,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    primaryText: {
      color: theme.colors.foregroundInverse,
      fontWeight: "700",
    },
    progressFill: {
      backgroundColor: theme.colors.accent,
      borderRadius: theme.radii.pill,
      height: "100%",
    },
    progressTrack: {
      backgroundColor: theme.colors.accentMuted,
      borderRadius: theme.radii.pill,
      height: 8,
      overflow: "hidden",
      width: "100%",
    },
    rtlText: { textAlign: "right", writingDirection: "rtl" },
    secondary: {
      alignItems: "center",
      backgroundColor: theme.colors.muted,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.control,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 44,
      minWidth: 44,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    secondaryText: { color: theme.colors.foreground, fontWeight: "700" },
  });
}
