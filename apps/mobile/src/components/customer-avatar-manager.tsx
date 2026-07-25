import * as Crypto from "expo-crypto";
import * as ImagePicker from "expo-image-picker";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { mobileApiRequest, MobileApiRequestError } from "../api/client";
import type { MobileLocale } from "../i18n/labels";
import {
  customerAvatarCancellationDisposition,
  MediaUploadEngineError,
  resolveAssetBoundAvatarPreview,
  runCustomerAvatarUpload,
  type CustomerAvatarCommitPhase,
} from "../media/upload-engine";
import {
  cancelCustomerAvatarUpload,
  createCustomerAvatarUploadDependencies,
  loadCustomerAvatarUpload,
  MediaUploadRuntimeError,
  prepareCustomerAvatarUpload,
} from "../media/upload-runtime";
import {
  firstSelectedImage,
  isImagePickerErrorResult,
  MediaUploadPolicyError,
  mediaPermissionDisposition,
  type CustomerAvatarUploadManifest,
  type MediaInputSource,
} from "../media/upload-policy";

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

export function CustomerAvatarManager({
  locale,
  ownerId,
}: {
  locale: MobileLocale;
  ownerId: string;
}) {
  const labels = copy[locale];
  const [container, setContainer] = useState<Container | null>(null);
  const [providerConfigured, setProviderConfigured] = useState<boolean | null>(
    null,
  );
  const [maximumBytes, setMaximumBytes] = useState<number | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [previewAssetId, setPreviewAssetId] = useState<string | null>(null);
  const [manifest, setManifest] =
    useState<CustomerAvatarUploadManifest | null>(null);
  const [pending, setPending] = useState(false);
  const [retryable, setRetryable] = useState(false);
  const [progress, setProgress] = useState(0);
  const [settingsRequired, setSettingsRequired] = useState(false);
  const [message, setMessage] = useState<string>(labels.loading);
  const activeCancelRef = useRef<(() => void) | null>(null);
  const activeAvatarAssetIdRef = useRef<string | null>(null);
  const commitPhaseRef =
    useRef<CustomerAvatarCommitPhase>("CANCELLABLE");
  const runAbortRef = useRef<AbortController | null>(null);
  const cancelRequestedRef = useRef(false);
  const verificationRequestedRef = useRef(false);
  const mountedRef = useRef(true);
  const binding =
    container?.bindings.find((item) => item.slot === "CUSTOMER_AVATAR")
    ?? null;

  const runUpload = useCallback(
    async (pendingManifest: CustomerAvatarUploadManifest) => {
      const controller = new AbortController();
      runAbortRef.current = controller;
      commitPhaseRef.current =
        pendingManifest.checkpoint === "VERIFY_ATTACH"
          ? "COMMITTING"
          : "CANCELLABLE";
      verificationRequestedRef.current = false;
      setPending(true);
      setRetryable(false);
      setProgress(0);
      setMessage(labels.uploading);
      try {
        const result = await runCustomerAvatarUpload(
          pendingManifest,
          createCustomerAvatarUploadDependencies({
            onCommitPhaseChange(phase) {
              commitPhaseRef.current = phase;
            },
            onActiveCancel(cancel) {
              activeCancelRef.current = cancel;
            },
            onProgress: setProgress,
            signal: controller.signal,
          }),
        );
        if (!mountedRef.current) return;
        const previousAssetId = activeAvatarAssetIdRef.current;
        activeAvatarAssetIdRef.current = result.assetId;
        setContainer(result.container);
        if (previousAssetId !== result.assetId) setAvatarUrl(null);
        setManifest(null);
        setProgress(1);
        setMessage(labels.success);
        verificationRequestedRef.current = false;
        const preview = await resolveAssetBoundAvatarPreview({
          assetId: result.assetId,
          currentAssetId: () => activeAvatarAssetIdRef.current,
          loadPreview: () =>
            mobileApiRequest<Data<{ url: string }>>(
              `/api/storage/customer/assets/${encodeURIComponent(result.assetId)}/download`,
              { authenticated: true, signal: controller.signal },
            ),
        });
        if (!mountedRef.current || preview.status === "STALE") return;
        if (preview.status === "READY") {
          setAvatarUrl(preview.value.data.url);
          setPreviewAssetId(null);
          setMessage(labels.success);
        } else {
          setPreviewAssetId(result.assetId);
          setMessage(labels.previewUnavailable);
        }
      } catch (error) {
        if (!mountedRef.current || cancelRequestedRef.current) return;
        const next = await loadCustomerAvatarUpload(ownerId).catch(() => null);
        if (!mountedRef.current) return;
        setManifest(next);
        const resolution = mediaErrorMessage(error, labels);
        const commitPhase =
          commitPhaseRef.current as CustomerAvatarCommitPhase;
        const commitUnconfirmed =
          verificationRequestedRef.current
          && commitPhase === "COMMITTING"
          && resolution.retryable
          && Boolean(next);
        setRetryable(Boolean(next) && (commitUnconfirmed || resolution.retryable));
        setMessage(
          commitUnconfirmed ? labels.commitUnconfirmed : resolution.message,
        );
      } finally {
        activeCancelRef.current = null;
        if (runAbortRef.current === controller) runAbortRef.current = null;
        if (mountedRef.current) setPending(false);
      }
    },
    [labels, ownerId],
  );

  const prepareAndRun = useCallback(
    async (
      asset: ImagePicker.ImagePickerAsset,
      source: MediaInputSource,
      activeContainer: Container,
      activeMaximumBytes: number,
    ) => {
      setPending(true);
      setRetryable(false);
      setProgress(0);
      setMessage(
        source === "ANDROID_RECOVERY"
          ? labels.processingRecovered
          : labels.normalizing,
      );
      try {
        const prepared = await prepareCustomerAvatarUpload({
          asset,
          containerVersion: activeContainer.version,
          maximumBytes: activeMaximumBytes,
          ownerId,
          source,
        });
        if (!mountedRef.current) return;
        setManifest(prepared);
        await runUpload(prepared);
      } catch (error) {
        if (!mountedRef.current) return;
        const resolution = mediaErrorMessage(error, labels);
        setRetryable(false);
        setMessage(resolution.message);
        setPending(false);
      }
    },
    [labels, ownerId, runUpload],
  );

  useEffect(() => {
    mountedRef.current = true;
    const controller = new AbortController();
    async function load() {
      try {
        const [media, capabilities] = await Promise.all([
          mobileApiRequest<Data<Container>>("/api/media/customer/profile", {
            authenticated: true,
            signal: controller.signal,
          }),
          mobileApiRequest<
            Data<{
              maximumSizeByPurpose: Record<string, number>;
              providerConfigured: boolean;
            }>
          >("/api/media/capabilities", { signal: controller.signal }),
        ]);
        if (!mountedRef.current) return;
        setContainer(media.data);
        setProviderConfigured(capabilities.data.providerConfigured);
        const limit =
          capabilities.data.maximumSizeByPurpose.CUSTOMER_AVATAR
          ?? null;
        setMaximumBytes(limit);
        const current = media.data.bindings.find(
          (item) => item.slot === "CUSTOMER_AVATAR",
        );
        const assetId = current?.media?.assetId;
        const previousAssetId = activeAvatarAssetIdRef.current;
        activeAvatarAssetIdRef.current = assetId ?? null;
        if (previousAssetId !== activeAvatarAssetIdRef.current) {
          setAvatarUrl(null);
          setPreviewAssetId(null);
        }
        let previewUnavailable = false;
        if (assetId) {
          const preview = await resolveAssetBoundAvatarPreview({
            assetId,
            currentAssetId: () => activeAvatarAssetIdRef.current,
            loadPreview: () =>
              mobileApiRequest<Data<{ url: string }>>(
                `/api/storage/customer/assets/${encodeURIComponent(assetId)}/download`,
                { authenticated: true, signal: controller.signal },
              ),
          });
          if (!mountedRef.current) return;
          if (preview.status === "STALE") return;
          if (preview.status === "READY") {
            setAvatarUrl(preview.value.data.url);
            setPreviewAssetId(null);
          } else if (preview.status === "UNAVAILABLE") {
            previewUnavailable = true;
            setPreviewAssetId(assetId);
          }
        }
        const recovered = await loadCustomerAvatarUpload(ownerId);
        if (!mountedRef.current) return;
        if (recovered) {
          setManifest(recovered);
          commitPhaseRef.current =
            recovered.checkpoint === "VERIFY_ATTACH"
              ? "COMMITTING"
              : "CANCELLABLE";
          if (Date.now() >= recovered.expiresAt) {
            await cancelCustomerAvatarUpload(recovered, controller.signal);
            if (mountedRef.current) {
              setManifest(null);
              setMessage(labels.expired);
            }
          } else if (
            capabilities.data.providerConfigured
            || recovered.checkpoint === "ATTACH"
            || recovered.checkpoint === "VERIFY_ATTACH"
          ) {
            await runUpload(recovered);
          } else {
            setMessage(labels.unavailable);
          }
          return;
        }
        const pendingPicker = await ImagePicker.getPendingResultAsync();
        if (isImagePickerErrorResult(pendingPicker)) {
          setMessage(labels.error);
          return;
        }
        const recoveredAsset = firstSelectedImage<ImagePicker.ImagePickerAsset>(
          pendingPicker,
        );
        if (
          recoveredAsset
          && limit
          && capabilities.data.providerConfigured
        ) {
          await prepareAndRun(
            recoveredAsset,
            "ANDROID_RECOVERY",
            media.data,
            limit,
          );
          return;
        }
        if (mountedRef.current) {
          setMessage(
            previewUnavailable
              ? labels.previewUnavailable
              : capabilities.data.providerConfigured
                ? ""
                : labels.unavailable,
          );
        }
      } catch (error) {
        if (mountedRef.current && !controller.signal.aborted) {
          setMessage(mediaErrorMessage(error, labels).message);
        }
      }
    }
    void load();
    return () => {
      mountedRef.current = false;
      controller.abort();
      runAbortRef.current?.abort();
      activeCancelRef.current?.();
    };
  }, [labels, ownerId, prepareAndRun, runUpload]);

  async function choose(source: "CAMERA" | "LIBRARY") {
    if (
      !container
      || !providerConfigured
      || !maximumBytes
      || pending
      || manifest
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
        setSettingsRequired(permissionState === "DENIED_BLOCKED");
        setMessage(
          permissionState === "DENIED_BLOCKED"
            ? labels.permissionBlocked
            : source === "CAMERA"
              ? labels.cameraPermission
              : labels.libraryPermission,
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
      const selectedAsset = firstSelectedImage<ImagePicker.ImagePickerAsset>(
        selection,
      );
      if (!selectedAsset) {
        setMessage(labels.pickerCancelled);
        return;
      }
      await prepareAndRun(
        selectedAsset,
        source,
        container,
        maximumBytes,
      );
    } catch (error) {
      if (mountedRef.current) {
        setMessage(mediaErrorMessage(error, labels).message);
      }
    }
  }

  async function retry() {
    if (pending) return;
    let recovered: CustomerAvatarUploadManifest | null;
    try {
      recovered = await loadCustomerAvatarUpload(ownerId);
    } catch (error) {
      setManifest(null);
      setRetryable(false);
      setMessage(mediaErrorMessage(error, labels).message);
      return;
    }
    if (!recovered) {
      setManifest(null);
      setRetryable(false);
      setMessage(labels.expired);
      return;
    }
    setManifest(recovered);
    await runUpload(recovered);
  }

  async function cancel() {
    if (!manifest) return;
    if (
      customerAvatarCancellationDisposition(commitPhaseRef.current)
      === "VERIFY"
    ) {
      verificationRequestedRef.current = true;
      setRetryable(false);
      setMessage(labels.verifyingCommit);
      return;
    }
    if (cancelRequestedRef.current) return;
    cancelRequestedRef.current = true;
    setPending(true);
    setRetryable(false);
    setMessage(labels.cancelling);
    activeCancelRef.current?.();
    runAbortRef.current?.abort();
    const controller = new AbortController();
    try {
      const latest =
        await loadCustomerAvatarUpload(ownerId).catch(() => manifest);
      await cancelCustomerAvatarUpload(latest ?? manifest, controller.signal);
      if (!mountedRef.current) return;
      setManifest(null);
      commitPhaseRef.current = "CANCELLABLE";
      setProgress(0);
      setMessage(labels.cancelled);
    } catch (error) {
      if (mountedRef.current) {
        setMessage(mediaErrorMessage(error, labels).message);
      }
    } finally {
      cancelRequestedRef.current = false;
      if (mountedRef.current) setPending(false);
    }
  }

  async function remove() {
    if (!container || !binding || pending || manifest) return;
    setPending(true);
    setMessage(labels.deleting);
    try {
      const next = await mutate<Container>(
        `/api/media/customer/profile/bindings/${binding.id}`,
        "DELETE",
        {
          expectedVersion: container.version,
          slot: "CUSTOMER_AVATAR",
        },
      );
      setContainer(next);
      activeAvatarAssetIdRef.current = null;
      setAvatarUrl(null);
      setPreviewAssetId(null);
      setMessage("");
    } catch (error) {
      setMessage(mediaErrorMessage(error, labels).message);
    } finally {
      setPending(false);
    }
  }

  async function retryPreview() {
    const assetId = previewAssetId;
    if (!assetId || pending) return;
    setPending(true);
    setMessage(labels.refreshingPreview);
    const preview = await resolveAssetBoundAvatarPreview({
      assetId,
      currentAssetId: () => activeAvatarAssetIdRef.current,
      loadPreview: () =>
        mobileApiRequest<Data<{ url: string }>>(
          `/api/storage/customer/assets/${encodeURIComponent(assetId)}/download`,
          { authenticated: true },
        ),
    });
    if (mountedRef.current) {
      if (preview.status === "READY") {
        setAvatarUrl(preview.value.data.url);
        setPreviewAssetId(null);
        setMessage(labels.success);
      } else if (preview.status === "UNAVAILABLE") {
        setMessage(labels.previewUnavailable);
      }
    }
    if (mountedRef.current) setPending(false);
  }

  const newUploadDisabled =
    pending || Boolean(manifest) || providerConfigured !== true;
  return (
    <View style={styles.card} accessibilityLiveRegion="polite">
      {avatarUrl ? (
        <Image
          accessibilityLabel={labels.avatarLabel}
          alt={labels.avatarLabel}
          source={{ uri: avatarUrl }}
          style={styles.avatar}
        />
      ) : null}
      <View style={styles.actions}>
        <ActionButton
          disabled={newUploadDisabled}
          label={labels.addCamera}
          onPress={() => void choose("CAMERA")}
          primary
        />
        <ActionButton
          disabled={newUploadDisabled}
          label={labels.addLibrary}
          onPress={() => void choose("LIBRARY")}
          primary
        />
        {retryable && manifest ? (
          <ActionButton
            disabled={pending}
            label={labels.retry}
            onPress={() => void retry()}
            primary
          />
        ) : null}
        {manifest ? (
          <ActionButton
            disabled={false}
            label={labels.cancelOperation}
            onPress={() => void cancel()}
          />
        ) : null}
        {previewAssetId ? (
          <ActionButton
            disabled={pending}
            label={labels.refreshPreview}
            onPress={() => void retryPreview()}
          />
        ) : null}
        {binding ? (
          <ActionButton
            disabled={pending || Boolean(manifest)}
            label={labels.remove}
            onPress={() => void remove()}
          />
        ) : null}
        {settingsRequired ? (
          <ActionButton
            disabled={false}
            label={labels.openSettings}
            onPress={() => void Linking.openSettings()}
          />
        ) : null}
      </View>
      {manifest || pending ? (
        <View
          accessibilityLabel={`${labels.progress}: ${Math.round(progress * 100)}%`}
          accessibilityRole="progressbar"
          accessibilityValue={{ max: 100, min: 0, now: Math.round(progress * 100) }}
          style={styles.progressTrack}
        >
          <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
      ) : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}

function ActionButton({
  disabled,
  label,
  onPress,
  primary = false,
}: {
  disabled: boolean;
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        primary ? styles.primary : styles.secondary,
        disabled && styles.disabled,
      ]}
    >
      <Text style={primary ? styles.primaryText : styles.secondaryText}>
        {label}
      </Text>
    </Pressable>
  );
}

async function mutate<T>(
  path: string,
  method: "DELETE" | "POST" | "PUT",
  body: unknown,
) {
  const response = await mobileApiRequest<Data<T>>(path, {
    authenticated: true,
    body,
    headers: { "Idempotency-Key": Crypto.randomUUID() },
    method,
  });
  return response.data;
}

function mediaErrorMessage(
  error: unknown,
  labels: (typeof copy)[MobileLocale],
) {
  const code = errorCode(error);
  if (code === "STORAGE_PROVIDER_NOT_CONFIGURED") {
    return result(labels.unavailable);
  }
  if (code === "STORAGE_QUOTA_EXCEEDED") return result(labels.quota);
  if (code === "FILE_TOO_LARGE") return result(labels.fileTooLarge);
  if (code === "UNSUPPORTED_MEDIA_TYPE") return result(labels.unsupported);
  if (
    code === "INVALID_FILE"
    || code === "NORMALIZATION_FAILED"
    || code === "PIXEL_LIMIT_EXCEEDED"
    || code === "RECOVERY_FILE_MISMATCH"
    || code === "RECOVERY_INVALID"
    || code === "RECOVERY_UNSAFE_PATH"
    || code === "UNSAFE_UPLOAD_TARGET"
  ) {
    return result(labels.unsafeFile);
  }
  if (code === "REJECTED") return result(labels.rejected);
  if (code === "QUARANTINED") return result(labels.quarantined);
  if (code === "STALE_VERSION") return result(labels.stale);
  if (code === "DESTINATION_CHANGED") return result(labels.destinationChanged);
  if (code === "OFFLINE") return result(labels.offline, true);
  if (code === "TIMEOUT") return result(labels.timeout, true);
  if (code === "MAX_RETRIES_REACHED") return result(labels.maxRetries);
  if (code === "RECOVERY_EXPIRED") return result(labels.expired);
  if (code === "RECOVERY_CLEANUP_FAILED") {
    return result(labels.cleanupFailed, true);
  }
  if (code === "ALREADY_RUNNING" || code === "PENDING_OPERATION") {
    return result(labels.duplicate);
  }
  if (code === "CANCELLED") return result(labels.cancelled);
  if (
    error instanceof MediaUploadEngineError
    && error.retryable
  ) {
    return result(labels.retryable, true);
  }
  if (
    error instanceof MobileApiRequestError
    && ["RATE_LIMITED", "SERVICE_UNAVAILABLE", "STORAGE_PROVIDER_FAILURE"].includes(
      error.code ?? "",
    )
  ) {
    return result(labels.retryable, true);
  }
  return result(labels.error);
}

function errorCode(error: unknown) {
  if (
    error instanceof MediaUploadEngineError
    || error instanceof MediaUploadPolicyError
    || error instanceof MediaUploadRuntimeError
    || error instanceof MobileApiRequestError
  ) {
    return error.code ?? "";
  }
  return "";
}

function result(message: string, retryable = false) {
  return { message, retryable };
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  avatar: { borderRadius: 48, height: 96, width: 96 },
  card: {
    borderColor: "rgba(120,120,120,0.25)",
    borderRadius: 18,
    borderWidth: 1,
    gap: 12,
    marginTop: 16,
    padding: 14,
  },
  disabled: { opacity: 0.45 },
  message: { color: "#6b7280", fontSize: 13, lineHeight: 20 },
  primary: {
    backgroundColor: "#7c3aed",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  primaryText: { color: "#ffffff", fontWeight: "700" },
  progressFill: {
    backgroundColor: "#7c3aed",
    borderRadius: 999,
    height: "100%",
  },
  progressTrack: {
    backgroundColor: "rgba(124,58,237,0.16)",
    borderRadius: 999,
    height: 8,
    overflow: "hidden",
    width: "100%",
  },
  secondary: {
    borderColor: "#ef4444",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  secondaryText: { color: "#ef4444", fontWeight: "700" },
});
