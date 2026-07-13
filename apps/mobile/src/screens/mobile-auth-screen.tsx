import { useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { signInWithEmail, signUpWithEmail } from "../auth/client";
import {
  MOBILE_AUTH_MIN_PASSWORD_LENGTH,
  validateMobileAuthForm,
  type MobileAuthMode,
  type MobileAuthValidationCode,
} from "../auth/form";
import { TOUCH_HIT_SLOP } from "../components/mobile-chrome";
import { PremiumEntrance } from "../components/premium-motion";
import { getTextDirection, type MobileLocale } from "../i18n/labels";
import type { MobileTheme } from "../theme/tokens";

const typography = {
  kufiBold: "NotoKufiArabic-Bold",
  uiBold: "NotoSansArabicUI-Bold",
  uiMedium: "NotoSansArabicUI-Medium",
  uiRegular: "NotoSansArabicUI-Regular",
  uiSemiBold: "NotoSansArabicUI-SemiBold",
};

export type MobileAuthUser = {
  email: string;
  id: string;
  image?: string | null;
  name: string;
};

export type MobileAuthCopy = {
  accountDescription: string;
  accountGuestDescription: string;
  accountGuestTitle: string;
  authFailure: string;
  back: string;
  createAccount: string;
  creatingAccount: string;
  email: string;
  emailInvalid: string;
  emailRequired: string;
  finishSetup: string;
  finishingSetup: string;
  name: string;
  nameRequired: string;
  password: string;
  passwordHint: string;
  passwordTooShort: string;
  sessionError: string;
  sessionLoading: string;
  setupDescription: string;
  setupFailure: string;
  signedIn: string;
  signedOut: string;
  signIn: string;
  signInDescription: string;
  signingIn: string;
  signOut: string;
  signUpDescription: string;
  switchToSignIn: string;
  switchToSignUp: string;
};

export const mobileAuthCopy: Record<MobileLocale, MobileAuthCopy> = {
  ar: {
    accountDescription:
      "جلستك متصلة بأمان مع REZNO ويمكن استخدامها في السلة والطلبات والمفضلة.",
    accountGuestDescription:
      "سجّل الدخول أو أنشئ حساباً للوصول إلى السلة والطلبات والمفضلة.",
    accountGuestTitle: "أهلاً بك في حساب REZNO",
    authFailure: "تعذر إكمال العملية. تحقق من البيانات وحاول مرة أخرى.",
    back: "رجوع",
    createAccount: "إنشاء حساب",
    creatingAccount: "جاري إنشاء الحساب...",
    email: "البريد الإلكتروني",
    emailInvalid: "أدخل بريداً إلكترونياً صحيحاً.",
    emailRequired: "البريد الإلكتروني مطلوب.",
    finishSetup: "إكمال إعداد العميل",
    finishingSetup: "جاري إكمال الإعداد...",
    name: "الاسم",
    nameRequired: "الاسم مطلوب لإنشاء الحساب.",
    password: "كلمة المرور",
    passwordHint: "ثمانية أحرف على الأقل.",
    passwordTooShort: `يجب ألا تقل كلمة المرور عن ${MOBILE_AUTH_MIN_PASSWORD_LENGTH} أحرف.`,
    sessionError: "تعذر التحقق من الجلسة. يمكنك المحاولة عبر تسجيل الدخول.",
    sessionLoading: "جاري التحقق من الجلسة...",
    setupDescription:
      "تم حفظ جلسة حسابك. أكمل إعداد ملف العميل لاستخدام السلة والطلبات والمفضلة.",
    setupFailure:
      "تم حفظ جلسة الحساب، لكن تعذر إكمال ملف العميل. أعد المحاولة دون إنشاء الحساب من جديد.",
    signedIn: "تم تسجيل الدخول",
    signedOut: "لم تسجّل الدخول بعد",
    signIn: "تسجيل الدخول",
    signInDescription: "استخدم بريدك وكلمة المرور للمتابعة إلى حسابك.",
    signingIn: "جاري تسجيل الدخول...",
    signOut: "تسجيل الخروج",
    signUpDescription: "أنشئ حساب REZNO جديداً للمتابعة.",
    switchToSignIn: "لدي حساب",
    switchToSignUp: "مستخدم جديد",
  },
  ckb: {
    accountDescription:
      "دانیشتنەکەت بە پارێزراوی بە REZNO پەیوەستە و بۆ سەبەتە و داواکارییەکان بەکاردێت.",
    accountGuestDescription:
      "بچۆ ژوورەوە یان هەژمارێک دروست بکە بۆ سەبەتە و داواکارییەکان.",
    accountGuestTitle: "بەخێربێیت بۆ هەژماری REZNO",
    authFailure: "کردارەکە تەواو نەبوو. زانیارییەکان بپشکنە و دووبارە هەوڵ بدە.",
    back: "گەڕانەوە",
    createAccount: "دروستکردنی هەژمار",
    creatingAccount: "هەژمار دروست دەکرێت...",
    email: "ئیمەیڵ",
    emailInvalid: "ئیمەیڵێکی دروست بنووسە.",
    emailRequired: "ئیمەیڵ پێویستە.",
    finishSetup: "تەواوکردنی ڕێکخستنی کڕیار",
    finishingSetup: "ڕێکخستن تەواو دەکرێت...",
    name: "ناو",
    nameRequired: "ناو بۆ دروستکردنی هەژمار پێویستە.",
    password: "وشەی نهێنی",
    passwordHint: "لانیکەم هەشت پیت.",
    passwordTooShort: `وشەی نهێنی دەبێت لانیکەم ${MOBILE_AUTH_MIN_PASSWORD_LENGTH} پیت بێت.`,
    sessionError: "پشکنینی دانیشتن سەرکەوتوو نەبوو. دووبارە بچۆ ژوورەوە.",
    sessionLoading: "دانیشتن پشکنین دەکرێت...",
    setupDescription:
      "دانیشتنەکەت پارێزرا. ڕێکخستنی کڕیار تەواو بکە بۆ سەبەتە و داواکارییەکان.",
    setupFailure:
      "دانیشتنەکەت پارێزرا، بەڵام پرۆفایلی کڕیار تەواو نەبوو. دووبارە هەوڵ بدە.",
    signedIn: "چوویتە ژوورەوە",
    signedOut: "هێشتا نەچوویتە ژوورەوە",
    signIn: "چوونە ژوورەوە",
    signInDescription: "بە ئیمەیڵ و وشەی نهێنی بچۆ ژوورەوە.",
    signingIn: "دەچێتە ژوورەوە...",
    signOut: "چوونە دەرەوە",
    signUpDescription: "هەژمارێکی نوێی REZNO دروست بکە.",
    switchToSignIn: "هەژمارم هەیە",
    switchToSignUp: "بەکارهێنەری نوێ",
  },
  en: {
    accountDescription:
      "Your secure REZNO session is ready for cart, orders, and favorites.",
    accountGuestDescription:
      "Sign in or create an account to use cart, orders, and favorites.",
    accountGuestTitle: "Welcome to your REZNO account",
    authFailure: "We could not complete that request. Check your details and try again.",
    back: "Back",
    createAccount: "Create account",
    creatingAccount: "Creating account...",
    email: "Email",
    emailInvalid: "Enter a valid email address.",
    emailRequired: "Email is required.",
    finishSetup: "Finish customer setup",
    finishingSetup: "Finishing setup...",
    name: "Name",
    nameRequired: "Name is required to create an account.",
    password: "Password",
    passwordHint: "At least eight characters.",
    passwordTooShort: `Password must be at least ${MOBILE_AUTH_MIN_PASSWORD_LENGTH} characters.`,
    sessionError: "We could not verify your session. You can try signing in again.",
    sessionLoading: "Checking your session...",
    setupDescription:
      "Your account session is saved. Finish the customer profile to use cart, orders, and favorites.",
    setupFailure:
      "Your session is saved, but the customer profile could not be completed. Retry without creating the account again.",
    signedIn: "Signed in",
    signedOut: "Not signed in yet",
    signIn: "Sign in",
    signInDescription: "Use your email and password to continue to your account.",
    signingIn: "Signing in...",
    signOut: "Sign out",
    signUpDescription: "Create a new REZNO account to continue.",
    switchToSignIn: "I have an account",
    switchToSignUp: "New customer",
  },
};

export function MobileAuthScreen({
  initialMode,
  initialSetupUser = null,
  locale,
  onAuthenticated,
  onBack,
  theme,
}: {
  initialMode: MobileAuthMode;
  initialSetupUser?: MobileAuthUser | null;
  locale: MobileLocale;
  onAuthenticated: (user: MobileAuthUser) => Promise<boolean>;
  onBack: () => void;
  theme: MobileTheme;
}) {
  const copy = mobileAuthCopy[locale];
  const isRtl = getTextDirection(locale) === "rtl";
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [mode, setMode] = useState<MobileAuthMode>(initialMode);
  const [setupUser, setSetupUser] = useState<MobileAuthUser | null>(
    initialSetupUser,
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [validationCode, setValidationCode] =
    useState<MobileAuthValidationCode | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);

  const changeMode = (nextMode: MobileAuthMode) => {
    if (pending || mode === nextMode) return;
    setMode(nextMode);
    setValidationCode(null);
    setRequestError(null);
  };

  const clearError = () => {
    if (validationCode) setValidationCode(null);
    if (requestError) setRequestError(null);
  };

  const finishSetup = async (user: MobileAuthUser) => {
    setPending(true);
    setRequestError(null);
    const completed = await onAuthenticated(user).catch(() => false);
    if (completed) return;
    setRequestError(copy.setupFailure);
    setPending(false);
  };

  const submit = async () => {
    if (pending) return;
    if (setupUser) {
      await finishSetup(setupUser);
      return;
    }

    const validation = validateMobileAuthForm(mode, { email, name, password });
    if (!validation.ok) {
      setValidationCode(validation.code);
      setRequestError(null);
      return;
    }

    setPending(true);
    setValidationCode(null);
    setRequestError(null);

    try {
      const result =
        mode === "signin"
          ? await signInWithEmail({
              email: validation.values.email,
              password: validation.values.password,
            })
          : await signUpWithEmail({
              email: validation.values.email,
              name: validation.values.name,
              password: validation.values.password,
            });

      if (result.error || !result.data?.user) {
        setRequestError(copy.authFailure);
        setPending(false);
        return;
      }

      const completed = await onAuthenticated(result.data.user).catch(
        () => false,
      );
      if (completed) return;
      setSetupUser(result.data.user);
      setRequestError(copy.setupFailure);
      setPending(false);
    } catch {
      setRequestError(copy.authFailure);
      setPending(false);
    }
  };

  const errorMessage = validationCode
    ? validationMessage(validationCode, copy)
    : requestError;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.keyboard}
    >
      <ScrollView
        automaticallyAdjustKeyboardInsets
        bounces={false}
        contentContainerStyle={styles.screen}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          accessibilityLabel={copy.back}
          accessibilityRole="button"
          disabled={pending}
          hitSlop={TOUCH_HIT_SLOP}
          onPress={onBack}
          style={({ pressed }) => [
            styles.backButton,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.backArrow}>{isRtl ? "›" : "‹"}</Text>
          <Text style={[styles.backText, isRtl && styles.rtl]}>{copy.back}</Text>
        </Pressable>

        <PremiumEntrance distance={14} style={styles.card}>
          <View style={styles.brandMark}>
            <Text style={styles.brandMarkText}>R</Text>
          </View>
          <Text style={styles.brandName}>REZNO</Text>
          <Text style={[styles.title, isRtl && styles.rtl]}>
            {setupUser
              ? copy.finishSetup
              : mode === "signin"
                ? copy.signIn
                : copy.createAccount}
          </Text>
          <Text style={[styles.description, isRtl && styles.rtl]}>
            {setupUser
              ? copy.setupDescription
              : mode === "signin"
                ? copy.signInDescription
                : copy.signUpDescription}
          </Text>

          {!setupUser ? (
            <>
              <View style={styles.modeRow}>
                <ModeButton
                  active={mode === "signin"}
                  disabled={pending}
                  label={copy.switchToSignIn}
                  onPress={() => changeMode("signin")}
                  styles={styles}
                />
                <ModeButton
                  active={mode === "signup"}
                  disabled={pending}
                  label={copy.switchToSignUp}
                  onPress={() => changeMode("signup")}
                  styles={styles}
                />
              </View>

              <View style={styles.fields}>
                {mode === "signup" ? (
                  <AuthField label={copy.name} styles={styles}>
                    <TextInput
                      accessibilityLabel={copy.name}
                      autoCapitalize="words"
                      autoComplete="name"
                      editable={!pending}
                      maxLength={120}
                      onChangeText={(value) => {
                        setName(value);
                        clearError();
                      }}
                      placeholder={copy.name}
                      placeholderTextColor={theme.colors.disabledText}
                      returnKeyType="next"
                      style={styles.input}
                      textAlign={isRtl ? "right" : "left"}
                      textContentType="name"
                      value={name}
                    />
                  </AuthField>
                ) : null}
                <AuthField label={copy.email} styles={styles}>
                  <TextInput
                    accessibilityLabel={copy.email}
                    autoCapitalize="none"
                    autoComplete="email"
                    autoCorrect={false}
                    editable={!pending}
                    keyboardType="email-address"
                    maxLength={254}
                    onChangeText={(value) => {
                      setEmail(value);
                      clearError();
                    }}
                    placeholder="name@example.com"
                    placeholderTextColor={theme.colors.disabledText}
                    returnKeyType="next"
                    style={[styles.input, styles.inputLtr]}
                    textContentType="emailAddress"
                    value={email}
                  />
                </AuthField>
                <AuthField label={copy.password} styles={styles}>
                  <TextInput
                    accessibilityHint={copy.passwordHint}
                    accessibilityLabel={copy.password}
                    autoCapitalize="none"
                    autoComplete={
                      mode === "signin" ? "current-password" : "new-password"
                    }
                    autoCorrect={false}
                    editable={!pending}
                    maxLength={128}
                    onChangeText={(value) => {
                      setPassword(value);
                      clearError();
                    }}
                    onSubmitEditing={() => {
                      void submit();
                    }}
                    placeholder={copy.password}
                    placeholderTextColor={theme.colors.disabledText}
                    returnKeyType="done"
                    secureTextEntry
                    style={[styles.input, styles.inputLtr]}
                    textContentType={
                      mode === "signin" ? "password" : "newPassword"
                    }
                    value={password}
                  />
                  <Text style={[styles.hint, isRtl && styles.rtl]}>
                    {copy.passwordHint}
                  </Text>
                </AuthField>
              </View>
            </>
          ) : null}

          {errorMessage ? (
            <View accessibilityLiveRegion="polite" style={styles.error}>
              <Text style={[styles.errorText, isRtl && styles.rtl]}>
                {errorMessage}
              </Text>
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ busy: pending, disabled: pending }}
            disabled={pending}
            onPress={() => {
              void submit();
            }}
            style={({ pressed }) => [
              styles.submit,
              pending && styles.submitDisabled,
              pressed && !pending && styles.pressed,
            ]}
          >
            <Text style={styles.submitText}>
              {setupUser
                ? pending
                  ? copy.finishingSetup
                  : copy.finishSetup
                : pending
                  ? mode === "signin"
                    ? copy.signingIn
                    : copy.creatingAccount
                  : mode === "signin"
                    ? copy.signIn
                    : copy.createAccount}
            </Text>
          </Pressable>
        </PremiumEntrance>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function validationMessage(
  code: MobileAuthValidationCode,
  copy: MobileAuthCopy,
) {
  if (code === "EMAIL_INVALID") return copy.emailInvalid;
  if (code === "EMAIL_REQUIRED") return copy.emailRequired;
  if (code === "NAME_REQUIRED") return copy.nameRequired;
  return copy.passwordTooShort;
}

function ModeButton({
  active,
  disabled,
  label,
  onPress,
  styles,
}: {
  active: boolean;
  disabled: boolean;
  label: string;
  onPress: () => void;
  styles: AuthStyles;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.modeButton, active && styles.modeButtonActive]}
    >
      <Text style={[styles.modeText, active && styles.modeTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function AuthField({
  children,
  label,
  styles,
}: {
  children: React.ReactNode;
  label: string;
  styles: AuthStyles;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

type AuthStyles = ReturnType<typeof createStyles>;

function createStyles(theme: MobileTheme) {
  return StyleSheet.create({
    backArrow: {
      color: theme.colors.gold,
      fontFamily: typography.uiRegular,
      fontSize: 28,
      lineHeight: 30,
    },
    backButton: {
      alignItems: "center",
      alignSelf: "flex-start",
      flexDirection: "row",
      gap: 7,
      minHeight: 44,
      paddingHorizontal: 4,
    },
    backText: {
      color: theme.colors.foreground,
      fontFamily: typography.uiSemiBold,
      fontSize: 14,
      lineHeight: 20,
    },
    brandMark: {
      alignItems: "center",
      alignSelf: "center",
      backgroundColor: theme.colors.gold,
      borderColor: theme.colors.accent,
      borderRadius: 28,
      borderWidth: 1,
      height: 56,
      justifyContent: "center",
      shadowColor: theme.colors.deepGold,
      shadowOffset: { height: 8, width: 0 },
      shadowOpacity: theme.isDark ? 0.28 : 0.1,
      shadowRadius: 16,
      width: 56,
    },
    brandMarkText: {
      color: theme.colors.foregroundInverse,
      fontFamily: typography.uiBold,
      fontSize: 26,
      lineHeight: 34,
    },
    brandName: {
      color: theme.colors.gold,
      fontFamily: typography.uiSemiBold,
      fontSize: 13,
      letterSpacing: 4,
      lineHeight: 18,
      marginTop: 12,
      textAlign: "center",
      writingDirection: "ltr",
    },
    card: {
      alignSelf: "center",
      backgroundColor: theme.colors.card,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.card,
      borderWidth: 1,
      marginTop: 18,
      maxWidth: 520,
      padding: 22,
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 18, width: 0 },
      shadowOpacity: theme.isDark ? 0.32 : 0.1,
      shadowRadius: 28,
      width: "100%",
    },
    description: {
      color: theme.colors.mutedForeground,
      fontFamily: typography.uiRegular,
      fontSize: 14,
      lineHeight: 22,
      marginTop: 8,
      textAlign: "center",
    },
    error: {
      backgroundColor: theme.colors.dangerSoft,
      borderColor: theme.colors.danger,
      borderRadius: 16,
      borderWidth: 1,
      marginTop: 14,
      paddingHorizontal: 14,
      paddingVertical: 11,
    },
    errorText: {
      color: theme.colors.danger,
      fontFamily: typography.uiMedium,
      fontSize: 13,
      lineHeight: 20,
    },
    field: { gap: 7 },
    fields: { gap: 15, marginTop: 22 },
    hint: {
      color: theme.colors.mutedForeground,
      fontFamily: typography.uiRegular,
      fontSize: 11,
      lineHeight: 17,
    },
    input: {
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.control,
      borderWidth: 1,
      color: theme.colors.foreground,
      fontFamily: typography.uiRegular,
      fontSize: 15,
      minHeight: 52,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    inputLtr: { textAlign: "left", writingDirection: "ltr" },
    keyboard: { flex: 1 },
    label: {
      color: theme.colors.foreground,
      fontFamily: typography.uiSemiBold,
      fontSize: 13,
      lineHeight: 19,
    },
    modeButton: {
      alignItems: "center",
      borderRadius: 16,
      flex: 1,
      justifyContent: "center",
      minHeight: 42,
      paddingHorizontal: 8,
    },
    modeButtonActive: { backgroundColor: theme.colors.gold },
    modeRow: {
      backgroundColor: theme.colors.muted,
      borderColor: theme.colors.border,
      borderRadius: 18,
      borderWidth: 1,
      flexDirection: "row",
      gap: 4,
      marginTop: 22,
      padding: 4,
    },
    modeText: {
      color: theme.colors.mutedForeground,
      fontFamily: typography.uiSemiBold,
      fontSize: 12,
      lineHeight: 18,
      textAlign: "center",
    },
    modeTextActive: { color: theme.colors.foregroundInverse },
    pressed: { opacity: 0.86, transform: [{ scale: 0.985 }] },
    rtl: { textAlign: "right", writingDirection: "rtl" },
    screen: {
      flexGrow: 1,
      justifyContent: "center",
      paddingBottom: 32,
      paddingHorizontal: 20,
      paddingTop: 12,
    },
    submit: {
      alignItems: "center",
      backgroundColor: theme.colors.gold,
      borderColor: theme.colors.gold,
      borderRadius: theme.radii.control,
      borderWidth: 1,
      justifyContent: "center",
      marginTop: 20,
      minHeight: 54,
      paddingHorizontal: 18,
      shadowColor: theme.colors.deepGold,
      shadowOffset: { height: 8, width: 0 },
      shadowOpacity: theme.isDark ? 0.24 : 0.1,
      shadowRadius: 14,
    },
    submitDisabled: {
      backgroundColor: theme.colors.disabled,
      borderColor: theme.colors.border,
      shadowOpacity: 0,
    },
    submitText: {
      color: theme.colors.foregroundInverse,
      fontFamily: typography.uiSemiBold,
      fontSize: 16,
      lineHeight: 23,
      textAlign: "center",
    },
    title: {
      color: theme.colors.foreground,
      fontFamily: typography.kufiBold,
      fontSize: 24,
      lineHeight: 34,
      marginTop: 18,
      textAlign: "center",
    },
  });
}
