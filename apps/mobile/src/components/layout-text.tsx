import {
  Text as NativeText,
  TextInput as NativeTextInput,
  type TextInputProps,
  type TextProps,
} from "react-native";

import { LAYOUT_CRITICAL_MAX_FONT_SIZE_MULTIPLIER } from "../layout/responsive-metrics";

export function LayoutText({
  maxFontSizeMultiplier = LAYOUT_CRITICAL_MAX_FONT_SIZE_MULTIPLIER,
  ...props
}: TextProps) {
  return (
    <NativeText
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      {...props}
    />
  );
}

export function LayoutTextInput({
  maxFontSizeMultiplier = LAYOUT_CRITICAL_MAX_FONT_SIZE_MULTIPLIER,
  ...props
}: TextInputProps) {
  return (
    <NativeTextInput
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      {...props}
    />
  );
}
