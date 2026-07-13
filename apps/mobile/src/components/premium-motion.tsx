import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import {
  type ReactNode,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";

import { premiumMotion } from "../theme/motion";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

let reducedMotionEnabled = false;
let reducedMotionInitialized = false;
const reducedMotionListeners = new Set<() => void>();

function initializeReducedMotionPreference() {
  if (reducedMotionInitialized) return;
  reducedMotionInitialized = true;

  void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
    reducedMotionEnabled = enabled;
    reducedMotionListeners.forEach((listener) => listener());
  });
  AccessibilityInfo.addEventListener("reduceMotionChanged", (enabled) => {
    reducedMotionEnabled = enabled;
    reducedMotionListeners.forEach((listener) => listener());
  });
}

function subscribeToReducedMotion(listener: () => void) {
  initializeReducedMotionPreference();
  reducedMotionListeners.add(listener);

  return () => reducedMotionListeners.delete(listener);
}

export function useReducedMotionPreference() {
  return useSyncExternalStore(
    subscribeToReducedMotion,
    () => reducedMotionEnabled,
    () => false,
  );
}

export function PremiumPressable({
  children,
  disabled,
  onPressIn,
  onPressOut,
  scaleTo = premiumMotion.pressScale.standard,
  style,
  ...props
}: Omit<PressableProps, "style"> & {
  scaleTo?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const reducedMotion = useReducedMotionPreference();
  const [opacity] = useState(() => new Animated.Value(1));
  const [scale] = useState(() => new Animated.Value(1));

  const animatePressedState = (pressed: boolean) => {
    if (disabled) return;

    if (reducedMotion) {
      Animated.timing(opacity, {
        duration: premiumMotion.duration.instant,
        easing: Easing.out(Easing.quad),
        toValue: pressed ? 0.92 : 1,
        useNativeDriver: true,
      }).start();
      return;
    }

    if (pressed) {
      Animated.parallel([
        Animated.timing(scale, {
          duration: premiumMotion.duration.fast,
          easing: Easing.out(Easing.quad),
          toValue: scaleTo,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          duration: premiumMotion.duration.fast,
          easing: Easing.out(Easing.quad),
          toValue: 0.94,
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    Animated.parallel([
      Animated.spring(scale, {
        damping: premiumMotion.spring.damping,
        mass: premiumMotion.spring.mass,
        stiffness: premiumMotion.spring.stiffness,
        toValue: 1,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        duration: premiumMotion.duration.fast,
        easing: Easing.out(Easing.quad),
        toValue: 1,
        useNativeDriver: true,
      }),
    ]).start();
  };

  return (
    <AnimatedPressable
      {...props}
      disabled={disabled}
      onPressIn={(event) => {
        animatePressedState(true);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        animatePressedState(false);
        onPressOut?.(event);
      }}
      style={[
        style,
        {
          opacity,
          transform: [{ scale }],
        },
      ]}
    >
      {children}
    </AnimatedPressable>
  );
}

export function PremiumEntrance({
  children,
  delay = 0,
  distance = 12,
  horizontalDistance = 0,
  initialScale = 1,
  style,
}: {
  children: ReactNode;
  delay?: number;
  distance?: number;
  horizontalDistance?: number;
  initialScale?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const reducedMotion = useReducedMotionPreference();
  const [opacity] = useState(() => new Animated.Value(0));
  const [scale] = useState(() => new Animated.Value(initialScale));
  const [translateY] = useState(() => new Animated.Value(distance));
  const [translateX] = useState(
    () => new Animated.Value(horizontalDistance),
  );

  useEffect(() => {
    opacity.setValue(0);
    scale.setValue(reducedMotion ? 1 : initialScale);
    translateY.setValue(reducedMotion ? 0 : distance);
    translateX.setValue(reducedMotion ? 0 : horizontalDistance);

    const animation = reducedMotion
      ? Animated.timing(opacity, {
          duration: premiumMotion.duration.instant,
          easing: Easing.out(Easing.quad),
          toValue: 1,
          useNativeDriver: true,
        })
      : Animated.parallel([
          Animated.timing(opacity, {
            delay,
            duration: premiumMotion.duration.pageEnter,
            easing: Easing.out(Easing.cubic),
            toValue: 1,
            useNativeDriver: true,
          }),
          Animated.timing(translateY, {
            delay,
            duration: premiumMotion.duration.pageEnter,
            easing: Easing.out(Easing.cubic),
            toValue: 0,
            useNativeDriver: true,
          }),
          Animated.timing(translateX, {
            delay,
            duration: premiumMotion.duration.pageEnter,
            easing: Easing.out(Easing.cubic),
            toValue: 0,
            useNativeDriver: true,
          }),
          Animated.spring(scale, {
            damping: premiumMotion.spring.damping,
            delay,
            mass: premiumMotion.spring.mass,
            stiffness: premiumMotion.spring.stiffness,
            toValue: 1,
            useNativeDriver: true,
          }),
        ]);
    animation.start();

    return () => animation.stop();
  }, [
    delay,
    distance,
    horizontalDistance,
    initialScale,
    opacity,
    reducedMotion,
    scale,
    translateX,
    translateY,
  ]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity,
          transform: [{ translateX }, { translateY }, { scale }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

export function PremiumCheck({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <PremiumEntrance
      distance={0}
      initialScale={0.7}
      style={style}
    >
      {children}
    </PremiumEntrance>
  );
}
