import * as Crypto from "expo-crypto";
import * as ImagePicker from "expo-image-picker";

import { mobileApiRequest } from "../api/client";
import {
  CustomerAvatarUploadCoordinator,
} from "./upload-coordinator";
import {
  runCustomerAvatarUpload,
  type CustomerMediaContainer,
} from "./upload-engine";
import {
  cancelCustomerAvatarUpload,
  createCustomerAvatarUploadDependencies,
  loadCustomerAvatarUpload,
  prepareCustomerAvatarUpload,
} from "./upload-runtime";
import {
  firstSelectedImage,
  isImagePickerErrorResult,
  MediaUploadPolicyError,
} from "./upload-policy";

type Data<T> = { data: T };

export const customerAvatarUploadCoordinator =
  new CustomerAvatarUploadCoordinator({
    async bootstrap() {
      const [media, capabilities] = await Promise.all([
        mobileApiRequest<Data<CustomerMediaContainer>>(
          "/api/media/customer/profile",
          { authenticated: true },
        ),
        mobileApiRequest<
          Data<{
            maximumSizeByPurpose: Record<string, number>;
            providerConfigured: boolean;
          }>
        >("/api/media/capabilities"),
      ]);
      return {
        container: media.data,
        maximumBytes:
          capabilities.data.maximumSizeByPurpose.CUSTOMER_AVATAR ?? null,
        providerConfigured: capabilities.data.providerConfigured,
      };
    },
    cancel: cancelCustomerAvatarUpload,
    createAbortController: () => new AbortController(),
    createRunDependencies: createCustomerAvatarUploadDependencies,
    load: loadCustomerAvatarUpload,
    async loadPreview(assetId) {
      const response = await mobileApiRequest<Data<{ url: string }>>(
        `/api/storage/customer/assets/${encodeURIComponent(assetId)}/download`,
        { authenticated: true },
      );
      return response.data.url;
    },
    now: Date.now,
    prepare: prepareCustomerAvatarUpload,
    async recoverPendingInput() {
      const result = await ImagePicker.getPendingResultAsync();
      if (isImagePickerErrorResult(result)) {
        throw new MediaUploadPolicyError("RECOVERY_INVALID");
      }
      const asset =
        firstSelectedImage<ImagePicker.ImagePickerAsset>(result);
      return asset ? { asset, source: "ANDROID_RECOVERY" } : null;
    },
    async remove({ bindingId, containerVersion }) {
      const response = await mobileApiRequest<Data<CustomerMediaContainer>>(
        `/api/media/customer/profile/bindings/${encodeURIComponent(bindingId)}`,
        {
          authenticated: true,
          body: {
            expectedVersion: containerVersion,
            slot: "CUSTOMER_AVATAR",
          },
          headers: { "Idempotency-Key": Crypto.randomUUID() },
          method: "DELETE",
        },
      );
      return response.data;
    },
    run: runCustomerAvatarUpload,
    uuid: Crypto.randomUUID,
  });
