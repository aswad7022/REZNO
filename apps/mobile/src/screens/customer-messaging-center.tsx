import { randomUUID } from "expo-crypto";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { MobileApiRequestError } from "../api/client";
import { messageApi } from "../api/messages";
import type { MobileLocale } from "../i18n/labels";
import type { MobileTheme } from "../theme/tokens";
import type {
  MobileConversationDetail,
  MobileConversationSummary,
  MobileMessage,
} from "../types/messages";

type ConversationMode = "admin" | "all" | "booking" | "unread";

export function CustomerMessagingCenter({
  initialConversationId,
  locale,
  onOpenSource,
  theme,
}: {
  initialConversationId?: string | null;
  locale: MobileLocale;
  onOpenSource: (source: {
    bookingId: string;
    kind: "BOOKING" | "RESTAURANT_RESERVATION";
  }) => void;
  theme: MobileTheme;
}) {
  const copy = COPY[locale];
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [mode, setMode] = useState<ConversationMode>("all");
  const [conversations, setConversations] = useState<MobileConversationSummary[]>([]);
  const [conversationCursor, setConversationCursor] = useState<string | null>(null);
  const [listStatus, setListStatus] = useState<"error" | "loading" | "ready" | "unauthenticated">("loading");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<MobileConversationDetail | null>(null);
  const [messages, setMessages] = useState<MobileMessage[]>([]);
  const [messageCursor, setMessageCursor] = useState<string | null>(null);
  const [threadStatus, setThreadStatus] = useState<"error" | "idle" | "loading" | "ready">("idle");
  const [draft, setDraft] = useState("");
  const [sendStatus, setSendStatus] = useState<"error" | "idle" | "sending">("idle");
  const listSequence = useRef(0);
  const threadSequence = useRef(0);
  const sendKey = useRef(randomUUID());

  const loadConversations = useCallback(async (
    nextMode: ConversationMode,
    cursor?: string,
    append = false,
  ) => {
    const requestId = ++listSequence.current;
    setListStatus("loading");
    try {
      const page = await messageApi.conversations({ cursor, mode: nextMode });
      if (requestId !== listSequence.current) return;
      setConversations((current) =>
        append ? mergeById(current, page.data) : page.data,
      );
      setConversationCursor(page.nextCursor);
      setListStatus("ready");
    } catch (error) {
      if (requestId !== listSequence.current) return;
      setListStatus(
        error instanceof MobileApiRequestError && error.status === 401
          ? "unauthenticated"
          : "error",
      );
    }
  }, []);

  const openConversation = useCallback(async (conversationId: string) => {
    const requestId = ++threadSequence.current;
    setSelectedId(conversationId);
    setDetail(null);
    setMessages([]);
    setMessageCursor(null);
    setThreadStatus("loading");
    try {
      const [nextDetail, page] = await Promise.all([
        messageApi.conversation(conversationId),
        messageApi.messages(conversationId),
      ]);
      if (requestId !== threadSequence.current) return;
      setDetail(nextDetail);
      setMessages(page.data);
      setMessageCursor(page.nextCursor);
      setThreadStatus("ready");
      const throughMessageId = page.data[0]?.id;
      if (throughMessageId) {
        void messageApi.markRead(conversationId, throughMessageId)
          .then(() => {
            setConversations((current) => current.map((item) =>
              item.id === conversationId
                ? { ...item, unread: false, unreadCount: 0 }
                : item,
            ));
          })
          .catch(() => undefined);
      }
    } catch {
      if (requestId === threadSequence.current) setThreadStatus("error");
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void loadConversations(mode), 0);
    return () => {
      clearTimeout(timer);
      listSequence.current += 1;
    };
  }, [loadConversations, mode]);

  useEffect(() => {
    if (!initialConversationId || initialConversationId === selectedId) return;
    const timer = setTimeout(
      () => void openConversation(initialConversationId),
      0,
    );
    return () => clearTimeout(timer);
  }, [initialConversationId, openConversation, selectedId]);

  async function loadOlderMessages() {
    if (!selectedId || !messageCursor || threadStatus === "loading") return;
    setThreadStatus("loading");
    try {
      const page = await messageApi.messages(selectedId, messageCursor);
      setMessages((current) => mergeById(current, page.data));
      setMessageCursor(page.nextCursor);
      setThreadStatus("ready");
    } catch {
      setThreadStatus("error");
    }
  }

  async function send() {
    const body = draft.trim();
    if (!selectedId || !body || sendStatus === "sending") return;
    setSendStatus("sending");
    try {
      const result = await messageApi.send(selectedId, body, sendKey.current);
      setMessages((current) => mergeById([result.message], current));
      setDraft("");
      sendKey.current = randomUUID();
      setSendStatus("idle");
      void loadConversations(mode);
    } catch {
      // Keep the same UUID and body so an explicit retry is an exact replay.
      setSendStatus("error");
    }
  }

  if (selectedId) {
    return (
      <View style={styles.panel}>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            threadSequence.current += 1;
            setSelectedId(null);
            setThreadStatus("idle");
          }}
          style={styles.linkButton}
        >
          <Text style={styles.linkText}>{copy.back}</Text>
        </Pressable>
        {threadStatus === "loading" && !detail ? (
          <ActivityIndicator color={theme.colors.accent} />
        ) : null}
        {threadStatus === "error" && !detail ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => void openConversation(selectedId)}
            style={styles.empty}
          >
            <Text style={styles.title}>{copy.threadError}</Text>
            <Text style={styles.body}>{copy.retry}</Text>
          </Pressable>
        ) : null}
        {detail ? (
          <>
            <View style={styles.headingRow}>
              <View style={styles.headingCopy}>
                <Text style={styles.eyebrow}>{copy.thread}</Text>
                <Text style={styles.title}>{detail.title}</Text>
                <Text style={styles.body}>{detail.participantLabel}</Text>
              </View>
            </View>
            {detail.source ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => onOpenSource(detail.source!)}
                style={styles.source}
              >
                <Text style={styles.sourceTitle}>{copy.source}</Text>
                <Text style={styles.body}>{detail.source.label}</Text>
              </Pressable>
            ) : null}
            {messageCursor ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => void loadOlderMessages()}
                style={styles.linkButton}
              >
                <Text style={styles.linkText}>{copy.older}</Text>
              </Pressable>
            ) : null}
            <View style={styles.thread}>
              {[...messages].reverse().map((message) => (
                <View
                  key={message.id}
                  style={[
                    styles.bubble,
                    message.own ? styles.bubbleOwn : styles.bubbleOther,
                  ]}
                >
                  <Text style={message.own ? styles.bubbleOwnText : styles.bubbleText}>
                    {message.body}
                  </Text>
                  <Text style={message.own ? styles.bubbleOwnTime : styles.time}>
                    {formatDate(message.createdAt, locale)}
                  </Text>
                </View>
              ))}
            </View>
            {detail.canReply ? (
              <View style={styles.composer}>
                <TextInput
                  accessibilityLabel={copy.message}
                  maxLength={1000}
                  multiline
                  onChangeText={(value) => {
                    setDraft(value);
                    if (sendStatus === "error") {
                      sendKey.current = randomUUID();
                      setSendStatus("idle");
                    }
                  }}
                  placeholder={copy.placeholder}
                  placeholderTextColor={theme.colors.mutedForeground}
                  style={styles.input}
                  textAlign={locale === "en" ? "left" : "right"}
                  value={draft}
                />
                {sendStatus === "error" ? (
                  <Text style={styles.errorText}>{copy.sendError}</Text>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  disabled={!draft.trim() || sendStatus === "sending"}
                  onPress={() => void send()}
                  style={[
                    styles.sendButton,
                    (!draft.trim() || sendStatus === "sending") && styles.disabled,
                  ]}
                >
                  <Text style={styles.sendText}>
                    {sendStatus === "sending" ? copy.sending : copy.send}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.panel}>
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <Text style={styles.eyebrow}>{copy.eyebrow}</Text>
          <Text style={styles.title}>{copy.title}</Text>
          <Text style={styles.body}>{copy.description}</Text>
        </View>
      </View>
      <View style={styles.filters}>
        {(["all", "unread", "booking", "admin"] as const).map((value) => (
          <Pressable
            accessibilityRole="button"
            key={value}
            onPress={() => setMode(value)}
            style={[styles.filter, mode === value && styles.filterActive]}
          >
            <Text style={[styles.filterText, mode === value && styles.filterTextActive]}>
              {copy.filters[value]}
            </Text>
          </Pressable>
        ))}
      </View>
      {listStatus === "loading" && conversations.length === 0 ? (
        <ActivityIndicator color={theme.colors.accent} />
      ) : null}
      {listStatus === "error" || listStatus === "unauthenticated" ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => void loadConversations(mode)}
          style={styles.empty}
        >
          <Text style={styles.title}>
            {listStatus === "unauthenticated" ? copy.signIn : copy.listError}
          </Text>
          <Text style={styles.body}>{copy.retry}</Text>
        </Pressable>
      ) : null}
      {listStatus === "ready" && conversations.length === 0 ? (
        <Text style={styles.emptyText}>{copy.empty}</Text>
      ) : null}
      {conversations.map((conversation) => (
        <Pressable
          accessibilityRole="button"
          key={conversation.id}
          onPress={() => void openConversation(conversation.id)}
          style={[styles.item, conversation.unread && styles.itemUnread]}
        >
          <View style={styles.itemTop}>
            <Text numberOfLines={1} style={styles.itemTitle}>
              {conversation.title}
            </Text>
            {conversation.unread ? (
              <View style={styles.count}>
                <Text style={styles.countText}>
                  {conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}
                </Text>
              </View>
            ) : null}
          </View>
          <Text numberOfLines={2} style={styles.body}>
            {conversation.lastMessagePreview}
          </Text>
          <Text style={styles.time}>{formatDate(conversation.lastMessageAt, locale)}</Text>
        </Pressable>
      ))}
      {conversationCursor ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => void loadConversations(mode, conversationCursor, true)}
          style={styles.linkButton}
        >
          <Text style={styles.linkText}>{copy.more}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function mergeById<T extends { id: string }>(current: T[], incoming: T[]) {
  const seen = new Set<string>();
  return [...current, ...incoming].filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function formatDate(value: string, locale: MobileLocale) {
  return new Date(value).toLocaleString(
    locale === "ckb" ? "ckb-IQ" : locale,
    { dateStyle: "short", timeStyle: "short" },
  );
}

const COPY = {
  ar: {
    admin: "الدعم", back: "العودة للمحادثات", booking: "الحجوزات",
    description: "محادثاتك مع الأعمال وفريق REZNO ضمن نطاق حسابك فقط.",
    empty: "لا توجد محادثات ضمن هذا المرشح.", eyebrow: "رسائل آمنة",
    filters: { admin: "الدعم", all: "الكل", booking: "الحجوزات", unread: "غير مقروء" },
    listError: "تعذر تحميل المحادثات.", message: "نص الرسالة", more: "تحميل المزيد",
    older: "تحميل الرسائل الأقدم", placeholder: "اكتب رسالتك…", retry: "إعادة المحاولة",
    send: "إرسال", sendError: "تعذر الإرسال. اضغط إرسال لإعادة المحاولة بالمفتاح نفسه.",
    sending: "جارٍ الإرسال…", signIn: "سجّل الدخول لعرض محادثاتك.", source: "فتح الحجز المرتبط",
    thread: "المحادثة", threadError: "تعذر تحميل المحادثة.", title: "المحادثات", unread: "غير مقروء",
  },
  ckb: {
    admin: "پشتیوانی", back: "گەڕانەوە بۆ گفتوگۆکان", booking: "حجزەکان",
    description: "گفتوگۆکانت لەگەڵ کار و تیمی REZNO تەنها لە چوارچێوەی هەژمارەکەت.",
    empty: "هیچ گفتوگۆیەک نییە.", eyebrow: "پەیامی پارێزراو",
    filters: { admin: "پشتیوانی", all: "هەموو", booking: "حجزەکان", unread: "نەخوێندراوە" },
    listError: "بارکردنی گفتوگۆ سەرکەوتوو نەبوو.", message: "دەقی پەیام", more: "زیاتر",
    older: "پەیامی کۆنتر", placeholder: "پەیامەکەت بنووسە…", retry: "دووبارە",
    send: "ناردن", sendError: "ناردن سەرکەوتوو نەبوو. دووبارە هەمان کلیل بەکاربهێنە.",
    sending: "دەنێردرێت…", signIn: "بچۆرە ژوورەوە بۆ بینینی گفتوگۆکان.", source: "کردنەوەی حجز",
    thread: "گفتوگۆ", threadError: "بارکردنی گفتوگۆ سەرکەوتوو نەبوو.", title: "گفتوگۆکان", unread: "نەخوێندراوە",
  },
  en: {
    admin: "Support", back: "Back to conversations", booking: "Bookings",
    description: "Your conversations with businesses and REZNO support, scoped to your account.",
    empty: "No conversations match this filter.", eyebrow: "Safe messaging",
    filters: { admin: "Support", all: "All", booking: "Bookings", unread: "Unread" },
    listError: "Conversations could not be loaded.", message: "Message", more: "Load more",
    older: "Load older messages", placeholder: "Write a message…", retry: "Retry",
    send: "Send", sendError: "Send failed. Tap Send to retry with the same key.",
    sending: "Sending…", signIn: "Sign in to view your conversations.", source: "Open linked booking",
    thread: "Conversation", threadError: "The conversation could not be loaded.", title: "Conversations", unread: "Unread",
  },
} as const;

function createStyles(theme: MobileTheme) {
  return StyleSheet.create({
    body: { color: theme.colors.mutedForeground, fontSize: 13, lineHeight: 20 },
    bubble: { borderRadius: 18, gap: 6, maxWidth: "88%", padding: 12 },
    bubbleOther: { alignSelf: "flex-start", backgroundColor: theme.colors.cardElevated, borderColor: theme.colors.border, borderWidth: 1 },
    bubbleOwn: { alignSelf: "flex-end", backgroundColor: theme.colors.accent },
    bubbleOwnText: { color: theme.colors.foregroundInverse, fontSize: 14, lineHeight: 21 },
    bubbleOwnTime: { color: theme.colors.foregroundInverse, fontSize: 10, opacity: 0.72 },
    bubbleText: { color: theme.colors.foreground, fontSize: 14, lineHeight: 21 },
    composer: { borderTopColor: theme.colors.border, borderTopWidth: 1, gap: 10, paddingTop: 14 },
    count: { alignItems: "center", backgroundColor: theme.colors.accent, borderRadius: 999, justifyContent: "center", minHeight: 28, minWidth: 28, paddingHorizontal: 6 },
    countText: { color: theme.colors.foregroundInverse, fontSize: 11, fontWeight: "800" },
    disabled: { opacity: 0.45 },
    empty: { alignItems: "center", gap: 6, padding: 22 },
    emptyText: { color: theme.colors.mutedForeground, padding: 22, textAlign: "center" },
    errorText: { color: theme.colors.danger, fontSize: 12 },
    eyebrow: { color: theme.colors.accent, fontSize: 12, fontWeight: "700", textTransform: "uppercase" },
    filter: { borderColor: theme.colors.border, borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
    filterActive: { backgroundColor: theme.colors.accent },
    filterText: { color: theme.colors.mutedForeground, fontSize: 12 },
    filterTextActive: { color: theme.colors.foregroundInverse, fontWeight: "700" },
    filters: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    headingCopy: { flex: 1 },
    headingRow: { alignItems: "center", flexDirection: "row", gap: 12 },
    input: { backgroundColor: theme.colors.cardElevated, borderColor: theme.colors.border, borderRadius: 18, borderWidth: 1, color: theme.colors.foreground, minHeight: 92, padding: 14, textAlignVertical: "top" },
    item: { backgroundColor: theme.colors.cardElevated, borderColor: theme.colors.border, borderRadius: 20, borderWidth: 1, gap: 7, padding: 15 },
    itemTitle: { color: theme.colors.foreground, flex: 1, fontSize: 15, fontWeight: "700" },
    itemTop: { alignItems: "center", flexDirection: "row", gap: 10 },
    itemUnread: { borderColor: theme.colors.accent },
    linkButton: { alignItems: "center", borderColor: theme.colors.accent, borderRadius: 16, borderWidth: 1, padding: 12 },
    linkText: { color: theme.colors.accent, fontWeight: "700" },
    panel: { backgroundColor: theme.colors.card, borderColor: theme.colors.border, borderRadius: 28, borderWidth: 1, gap: 14, padding: 18 },
    sendButton: { alignItems: "center", backgroundColor: theme.colors.accent, borderRadius: 16, padding: 14 },
    sendText: { color: theme.colors.foregroundInverse, fontWeight: "800" },
    source: { backgroundColor: theme.colors.accentMuted, borderRadius: 16, gap: 4, padding: 13 },
    sourceTitle: { color: theme.colors.accent, fontSize: 12, fontWeight: "700" },
    thread: { gap: 10 },
    time: { color: theme.colors.mutedForeground, fontSize: 10 },
    title: { color: theme.colors.foreground, fontSize: 20, fontWeight: "800" },
  });
}
