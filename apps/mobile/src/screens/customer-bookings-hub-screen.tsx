import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { MobileLocale } from "../i18n/labels";
import type { MobileTheme } from "../theme/tokens";
import { CustomerBookingManagementScreen } from "./customer-booking-management-screen";
import { CustomerRestaurantReservationManagementScreen } from "./customer-restaurant-reservation-management-screen";

type BookingDomain = "services" | "restaurants";

const COPY = {
  ar: { services: "الخدمات", restaurants: "المطاعم" },
  en: { services: "Services", restaurants: "Restaurants" },
  ckb: { services: "خزمەتگوزاری", restaurants: "چێشتخانەکان" },
} as const;

export function CustomerBookingsHubScreen(props: {
  isAuthenticated: boolean;
  isRtl: boolean;
  locale: MobileLocale;
  onSignIn: () => void;
  theme: MobileTheme;
}) {
  const [domain, setDomain] = useState<BookingDomain>("services");
  const styles = useMemo(() => createStyles(props.theme), [props.theme]);
  const copy = COPY[props.locale];
  return (
    <View style={styles.screen}>
      <View style={[styles.selector, props.isRtl && styles.rtlRow]}>
        {(["services", "restaurants"] as const).map((value) => (
          <Pressable
            accessibilityRole="button"
            key={value}
            onPress={() => setDomain(value)}
            style={[styles.choice, domain === value && styles.choiceActive]}
          >
            <Text style={[styles.label, domain === value && styles.labelActive]}>
              {copy[value]}
            </Text>
          </Pressable>
        ))}
      </View>
      {domain === "services" ? (
        <CustomerBookingManagementScreen {...props} />
      ) : (
        <CustomerRestaurantReservationManagementScreen {...props} />
      )}
    </View>
  );
}

function createStyles(theme: MobileTheme) {
  return StyleSheet.create({
    screen: { gap: 18 },
    selector: {
      backgroundColor: theme.colors.muted,
      borderColor: theme.colors.border,
      borderRadius: 16,
      borderWidth: 1,
      flexDirection: "row",
      gap: 6,
      padding: 5,
    },
    rtlRow: { flexDirection: "row-reverse" },
    choice: { alignItems: "center", borderRadius: 12, flex: 1, padding: 11 },
    choiceActive: { backgroundColor: theme.colors.accent },
    label: { color: theme.colors.mutedForeground, fontSize: 14, fontWeight: "700" },
    labelActive: { color: theme.colors.foregroundInverse },
  });
}
