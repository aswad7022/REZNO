import {
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";

import { PrimaryButton } from "./mobile-chrome";
import { LayoutText as Text } from "./layout-text";
import {
  DISPLAY_MAX_FONT_SIZE_MULTIPLIER,
  LAYOUT_CRITICAL_MAX_FONT_SIZE_MULTIPLIER,
} from "../layout/responsive-metrics";

type PrimaryButtonStyles = Parameters<typeof PrimaryButton>[0]["styles"];

type ScreenCompositionStyles = PrimaryButtonStyles & {
  rtlText: StyleProp<TextStyle>;
  screenDescription: StyleProp<TextStyle>;
  screenEyebrow: StyleProp<TextStyle>;
  screenTitle: StyleProp<TextStyle>;
  sectionAction: StyleProp<TextStyle>;
  sectionHeader: StyleProp<ViewStyle>;
  sectionTitle: StyleProp<TextStyle>;
  stateAction: StyleProp<ViewStyle>;
  stateCard: StyleProp<ViewStyle>;
  stateIcon: StyleProp<ViewStyle>;
  stateIconText: StyleProp<TextStyle>;
  stateIconTextWarning: StyleProp<TextStyle>;
  stateIconWarning: StyleProp<ViewStyle>;
  summaryItem: StyleProp<ViewStyle>;
  summaryLabel: StyleProp<TextStyle>;
  summaryValue: StyleProp<TextStyle>;
};

export function SectionHeader({
  action,
  isRtl,
  styles,
  title,
}: {
  action?: string;
  isRtl: boolean;
  styles: ScreenCompositionStyles;
  title: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text
        maxFontSizeMultiplier={DISPLAY_MAX_FONT_SIZE_MULTIPLIER}
        style={[styles.sectionTitle, isRtl && styles.rtlText]}
      >
        {title}
      </Text>
      {action ? (
        <Text
          maxFontSizeMultiplier={LAYOUT_CRITICAL_MAX_FONT_SIZE_MULTIPLIER}
          style={styles.sectionAction}
        >
          {action}
        </Text>
      ) : null}
    </View>
  );
}

export function PremiumStateCard({
  body,
  cta,
  icon,
  isRtl,
  label,
  onPress,
  styles,
  title,
  tone = "default",
}: {
  body: string;
  cta?: string;
  icon: string;
  isRtl: boolean;
  label: string;
  onPress?: () => void;
  styles: ScreenCompositionStyles;
  title: string;
  tone?: "default" | "warning";
}) {
  return (
    <View style={styles.stateCard}>
      <View
        style={[
          styles.stateIcon,
          tone === "warning" && styles.stateIconWarning,
        ]}
      >
        <Text
          style={[
            styles.stateIconText,
            tone === "warning" && styles.stateIconTextWarning,
          ]}
        >
          {icon}
        </Text>
      </View>
      <Text style={[styles.screenEyebrow, isRtl && styles.rtlText]}>
        {label}
      </Text>
      <Text style={[styles.screenTitle, isRtl && styles.rtlText]}>
        {title}
      </Text>
      <Text style={[styles.screenDescription, isRtl && styles.rtlText]}>
        {body}
      </Text>
      {cta ? (
        <View style={styles.stateAction}>
          <PrimaryButton label={cta} onPress={onPress} styles={styles} />
        </View>
      ) : null}
    </View>
  );
}

export function SummaryItem({
  label,
  styles,
  value,
}: {
  label: string;
  styles: ScreenCompositionStyles;
  value: string;
}) {
  return (
    <View style={styles.summaryItem}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}
