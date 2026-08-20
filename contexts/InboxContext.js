import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as inboxStorage from '../services/inboxStorage';
import * as conversationsApi from '../services/conversationsApi';
import * as notificationsApi from '../services/notificationsApi';
import { sendLocalPushNotification, registerNotificationResponseHandler } from '../services/pushNotifications';
import { sendEmail } from '../services/emailService';
import { sendSms } from '../services/smsService';
import { useSettings } from './SettingsContext';
import { useAuth } from './AuthContext';
import { useBookings } from './BookingsContext';

// These two already get a full, richer templated email from a dedicated
// Edge Function at their real write site (send-booking-confirmation from
// app/checkout/payment.js, send-booking-cancelled from
// BookingsContext.cancelBooking()/adminBookingsApi.cancelBooking()) -
// sending the plain generic email here too would double-email the user for
// the same event.
const EMAIL_TYPES_WITH_DEDICATED_TEMPLATE = new Set(['booking_created', 'booking_cancelled']);

const SUPPORT_CONVERSATION_ID = 'conv-support';
const REMINDER_WINDOW_MS = 24 * 60 * 60 * 1000;
const LIST_POLL_MS = 30 * 1000;
const SERVER_CONVERSATION_PREFIX = 'booking-';
const SERVER_NOTIFICATION_PREFIX = 'server-';

// Which Settings toggle gates each notification type - see
// contexts/SettingsContext.js for the toggle definitions.
const SETTINGS_KEY_BY_TYPE = {
  booking_created: 'bookingUpdates',
  booking_confirmed: 'bookingUpdates',
  booking_modified: 'bookingUpdates',
  booking_cancelled: 'bookingUpdates',
  payment: 'bookingUpdates',
  reminder: 'tripReminders',
  new_message: 'newMessages',
};

function buildNotificationContent(type, booking) {
  switch (type) {
    case 'booking_created':
      return { title: 'Booking Requested', body: `Your request for ${booking.carName} has been sent and is pending confirmation.` };
    case 'booking_confirmed':
      return { title: 'Booking Confirmed', body: `Your booking for ${booking.carName} is confirmed.` };
    case 'booking_modified':
      return { title: 'Booking Updated', body: `Your booking for ${booking.carName} has been updated.` };
    case 'booking_cancelled':
      return { title: 'Booking Cancelled', body: `Your booking for ${booking.carName} has been cancelled.` };
    case 'payment':
      return { title: 'Payment Received', body: `Payment for ${booking.carName} was processed successfully.` };
    case 'reminder':
      return { title: 'Upcoming Pickup', body: `Your pickup for ${booking.carName} is coming up soon - don't forget your driver's licence.` };
    default:
      return { title: 'WopeCar', body: '' };
  }
}

function isServerConversationId(id) {
  return typeof id === 'string' && id.startsWith(SERVER_CONVERSATION_PREFIX);
}

function rawServerConversationId(id) {
  return id.slice(SERVER_CONVERSATION_PREFIX.length);
}

// Maps a server conversation summary into the same shape the existing
// Inbox UI already renders (ConversationRow/[id].js) - always framed as
// "you and WopeCar Support" from the current viewer's perspective, even
// though an invited participant (e.g. a driver) may also be present, per
// "the messaging only includes wopecar support and the client."
function toLocalConversationShape(raw) {
  return {
    id: `${SERVER_CONVERSATION_PREFIX}${raw.id}`,
    participant: { id: 'support', name: 'WopeCar Support', role: 'Support', avatar: null },
    carId: null,
    bookingId: raw.bookingId,
    pinned: false,
    lastMessageText: raw.lastMessage?.body ?? (raw.pinnedSummary?.carName ? `Conversation started for your ${raw.pinnedSummary.carName} booking.` : 'Conversation started.'),
    lastMessageAt: raw.lastMessage?.createdAt ?? raw.createdAt,
    unreadCount: raw.unreadCount ?? 0,
    source: 'server',
    pinnedSummary: raw.pinnedSummary ?? null,
  };
}

const EMPTY_INBOX = {
  conversations: [], messages: [], notifications: [], remindedBookingIds: [], dismissedServerNotificationIds: [],
};

const InboxContext = createContext(null);

export function InboxProvider({ children }) {
  const [data, setData] = useState(EMPTY_INBOX);
  const [isLoading, setIsLoading] = useState(true);
  const [serverConversations, setServerConversations] = useState([]);
  const [serverMessagesByConversationId, setServerMessagesByConversationId] = useState({});
  const [serverNotifications, setServerNotifications] = useState([]);
  const dataRef = useRef(data);
  const { settings } = useSettings();
  const { user } = useAuth();
  const { bookings } = useBookings();

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    inboxStorage.getInboxData().then((loaded) => {
      // First-ever load: seed a permanent Support conversation so there's
      // always a real, in-app way to reach WopeCar - not gated behind any
      // booking or car, mirroring the always-visible support CTAs already
      // on the Safety Centre screen.
      if (loaded.conversations.length === 0) {
        const now = new Date().toISOString();
        const supportConversation = {
          id: SUPPORT_CONVERSATION_ID,
          participant: { id: 'support', name: 'WopeCar Support', role: 'Support', avatar: null },
          carId: null,
          bookingId: null,
          pinned: true,
          lastMessageText: "Hi! We're here if you need anything - bookings, payments, or general questions.",
          lastMessageAt: now,
          unreadCount: 1,
        };
        const welcomeMessage = {
          id: `msg-${Date.now()}`,
          conversationId: SUPPORT_CONVERSATION_ID,
          senderId: 'support',
          text: supportConversation.lastMessageText,
          createdAt: now,
          readAt: null,
        };
        const seeded = { ...EMPTY_INBOX, conversations: [supportConversation], messages: [welcomeMessage] };
        inboxStorage.setInboxData(seeded);
        setData(seeded);
      } else {
        setData(loaded);
      }
      setIsLoading(false);
    });
  }, []);

  // Native: tapping a delivered notification deep-links into the relevant
  // screen. Registered once - the imperative `router` singleton is used
  // inside pushNotifications.js since this fires outside any component's
  // render pass. No-op on web (the web equivalent is wired per-notification
  // via `.onclick` inside sendLocalPushNotification itself).
  useEffect(() => {
    const unregister = registerNotificationResponseHandler();
    return unregister;
  }, []);

  // --- Server-backed conversations & notifications ---------------------
  // Booking-anchored conversations (client<->support, auto-created by a
  // Postgres trigger on booking insert - see
  // supabase/migrations/0010_messaging.sql's create_conversation_for_booking())
  // and cross-account notifications (e.g. a host's booking alert) live on
  // Supabase now, not just locally. Polled rather than pushed - preserving
  // parity with the original design; no websocket/Realtime infra wired up.
  const syncServerConversations = useCallback(() => {
    if (!user) return;
    conversationsApi.getConversations()
      .then(setServerConversations)
      .catch(() => {});
  }, [user]);

  const syncServerNotifications = useCallback(() => {
    if (!user) return;
    notificationsApi.getServerNotifications()
      .then(setServerNotifications)
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!user) return;
    syncServerConversations();
    syncServerNotifications();
    const interval = setInterval(() => {
      syncServerConversations();
      syncServerNotifications();
    }, LIST_POLL_MS);
    return () => clearInterval(interval);
  }, [user, syncServerConversations, syncServerNotifications]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        syncServerConversations();
        syncServerNotifications();
      }
    });
    return () => subscription.remove();
  }, [syncServerConversations, syncServerNotifications]);

  // Called by a thread screen (on mount + its own polling interval) for a
  // server conversation. Always re-fetches the latest window (no since_id)
  // and upserts by id, rather than only fetching what's new - a delta fetch
  // would never surface a message's isRead flag flipping true after the
  // fact (the other party reading it doesn't mint a new message/id to
  // trigger a delta pickup), so Delivered->Read would never update once a
  // message was already cached. Any still-in-flight optimistic entry (a
  // send not yet confirmed, id prefixed 'pending-') is preserved untouched
  // since the fetch only ever returns confirmed, server-assigned messages.
  // Message ids are uuid strings now, not Laravel's auto-increment
  // integers - matching on the 'pending-' prefix (not typeof !== 'number')
  // is the only way to tell "still sending" apart from "confirmed", since
  // both are strings today.
  const syncMessages = useCallback((conversationId) => {
    if (!isServerConversationId(conversationId)) return;
    const rawId = rawServerConversationId(conversationId);

    conversationsApi.getMessages(rawId)
      .then((incoming) => {
        setServerMessagesByConversationId((prev) => {
          const existing = prev[rawId] ?? [];
          const stillSending = existing.filter((m) => typeof m.id === 'string' && m.id.startsWith('pending-'));
          const merged = [...stillSending, ...incoming];
          return { ...prev, [rawId]: merged };
        });
      })
      .catch(() => {});
  }, []);

  const notifyBookingEvent = useCallback((type, booking) => {
    const settingsKey = SETTINGS_KEY_BY_TYPE[type] ?? 'bookingUpdates';
    if (!settings[settingsKey]) return;

    const { title, body } = buildNotificationContent(type, booking);
    const notification = {
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      title,
      body,
      bookingId: booking.id,
      createdAt: new Date().toISOString(),
      readAt: null,
    };

    setData((prev) => {
      const next = { ...prev, notifications: [...prev.notifications, notification] };
      inboxStorage.setInboxData(next);
      return next;
    });

    if (settings.pushNotifications) {
      sendLocalPushNotification({ title, body, data: { url: `/booking/${booking.id}` } });
    }
    if (settings.emailNotifications && user?.email && !EMAIL_TYPES_WITH_DEDICATED_TEMPLATE.has(type)) {
      sendEmail({ subject: title, body }).catch(() => {});
    }
    if (settings.smsNotifications && user?.phone) {
      sendSms({ to: user.phone, body: `${title}: ${body}` });
    }
  }, [settings, user]);

  const scanReminders = useCallback(() => {
    const now = Date.now();
    const cutoff = now + REMINDER_WINDOW_MS;
    const due = bookings.filter((b) => {
      if (b.status !== 'Pending' && b.status !== 'Confirmed') return false;
      if (!b.startDate) return false;
      const startMs = new Date(b.startDate).getTime();
      if (Number.isNaN(startMs) || startMs <= now || startMs > cutoff) return false;
      return !dataRef.current.remindedBookingIds.includes(b.id);
    });
    if (due.length === 0) return;

    due.forEach((booking) => notifyBookingEvent('reminder', booking));

    setData((prev) => {
      const remindedBookingIds = [...prev.remindedBookingIds, ...due.map((b) => b.id)];
      const next = { ...prev, remindedBookingIds };
      inboxStorage.setInboxData(next);
      return next;
    });
  }, [bookings, notifyBookingEvent]);

  useEffect(() => {
    if (isLoading) return;
    scanReminders();
  }, [isLoading, scanReminders]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') scanReminders();
    });
    return () => subscription.remove();
  }, [scanReminders]);

  // Pre-booking "Inquiry" (app/car/[id].js) - unlike startConversation's old
  // local-only behavior (which collapsed every car into the same generic
  // conv-support id and silently dropped the welcome message), this goes
  // through the real create_or_get_inquiry_conversation RPC so the car is
  // actually pinned (conversations.car_id, see
  // supabase/migrations/0042_inquiry_conversations.sql) and visible to
  // staff/admin, same as a booking-anchored conversation already is.
  const startInquiry = useCallback(async (carId, welcomeMessage) => {
    const rawId = await conversationsApi.createInquiryConversation(carId);
    if (welcomeMessage) {
      await conversationsApi.sendMessage(rawId, welcomeMessage).catch(() => {});
    }
    syncServerConversations();
    return `${SERVER_CONVERSATION_PREFIX}${rawId}`;
  }, [syncServerConversations]);

  // `attachment` is `{ type, url, meta } | null` - the shape
  // chatAttachmentsApi.js's pick/upload helpers return, passed straight
  // through to conversationsApi.sendMessage. `text` may be empty when an
  // attachment carries the whole message (no caption) - the trimmed-empty
  // early-return below only applies when there's no attachment either.
  const sendMessage = useCallback((conversationId, text, attachment = null) => {
    const trimmed = text.trim();
    if (!trimmed && !attachment) return;
    const now = new Date().toISOString();

    if (isServerConversationId(conversationId)) {
      const rawId = rawServerConversationId(conversationId);
      const optimistic = {
        id: `pending-${Date.now()}`,
        conversationId: rawId,
        senderId: user?.id,
        senderName: user?.name,
        senderIsSupport: !!user?.isSupport,
        body: trimmed || null,
        attachmentType: attachment?.type ?? null,
        attachmentUrl: attachment?.url ?? null,
        attachmentMeta: attachment?.meta ?? null,
        createdAt: now,
      };
      setServerMessagesByConversationId((prev) => ({
        ...prev,
        [rawId]: [...(prev[rawId] ?? []), optimistic],
      }));

      conversationsApi.sendMessage(rawId, trimmed || null, attachment)
        .then((confirmed) => {
          // Swap the optimistic placeholder for the real, server-assigned
          // message as soon as the send confirms, rather than waiting for
          // the next poll - syncMessages preserves in-flight optimistic
          // entries (non-numeric ids) on every refresh, so without this the
          // placeholder would otherwise sit next to its own confirmed
          // message until the poll interval happened to overwrite it.
          setServerMessagesByConversationId((prev) => {
            const withoutOptimistic = (prev[rawId] ?? []).filter((m) => m.id !== optimistic.id);
            const alreadyPresent = withoutOptimistic.some((m) => m.id === confirmed.id);
            return { ...prev, [rawId]: alreadyPresent ? withoutOptimistic : [...withoutOptimistic, confirmed] };
          });
          syncServerConversations();
        })
        .catch(() => {
          // Never sent - drop the placeholder rather than leaving a bubble
          // stuck rendering forever.
          setServerMessagesByConversationId((prev) => ({
            ...prev,
            [rawId]: (prev[rawId] ?? []).filter((m) => m.id !== optimistic.id),
          }));
        });
      return;
    }

    const message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      conversationId,
      senderId: 'me',
      text: trimmed,
      createdAt: now,
      readAt: now,
    };
    setData((prev) => {
      const messages = [...prev.messages, message];
      const conversations = prev.conversations.map((c) =>
        c.id === conversationId ? { ...c, lastMessageText: trimmed, lastMessageAt: now } : c
      );
      const next = { ...prev, messages, conversations };
      inboxStorage.setInboxData(next);
      return next;
    });
  }, [user, syncServerConversations, syncMessages]);

  const getMessages = useCallback((conversationId) => {
    if (isServerConversationId(conversationId)) {
      const rawId = rawServerConversationId(conversationId);
      const raw = serverMessagesByConversationId[rawId] ?? [];
      return raw
        .map((m) => ({
          id: m.id,
          conversationId,
          // Translated to 'me' when the viewer is the sender, matching the
          // shape the existing MessageBubble already knows how to render
          // (isMe = message.senderId === 'me') - no UI change needed.
          senderId: m.senderId === user?.id ? 'me' : m.senderId,
          senderName: m.senderName,
          senderIsSupport: m.senderIsSupport,
          text: m.body,
          attachmentType: m.attachmentType ?? null,
          attachmentUrl: m.attachmentUrl ?? null,
          attachmentMeta: m.attachmentMeta ?? null,
          createdAt: m.createdAt,
          // Was hardcoded null - list_conversation_messages now returns a
          // real read_at timestamp (migration 0066_chat_attachments) for
          // the "Read · 3:45 PM" receipt; this used to silently discard it.
          readAt: m.readAt ?? null,
          isRead: !!m.isRead,
          isSending: typeof m.id === 'string' && m.id.startsWith('pending-'),
        }))
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    }

    return data.messages
      .filter((m) => m.conversationId === conversationId)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  }, [data.messages, serverMessagesByConversationId, user]);

  const markConversationRead = useCallback((conversationId) => {
    if (isServerConversationId(conversationId)) {
      const rawId = rawServerConversationId(conversationId);
      // String compare, not Number(rawId) - conversation ids are uuids now
      // (this used to assume Laravel's auto-increment integer PK; Number()
      // on a uuid is NaN, which would never match and silently leave the
      // unread badge stuck until the next poll).
      setServerConversations((prev) => prev.map((c) => (c.id === rawId ? { ...c, unreadCount: 0 } : c)));
      conversationsApi.markConversationRead(rawId).catch(() => {});
      return;
    }

    setData((prev) => {
      const conversation = prev.conversations.find((c) => c.id === conversationId);
      if (!conversation || conversation.unreadCount === 0) return prev;
      const conversations = prev.conversations.map((c) =>
        c.id === conversationId ? { ...c, unreadCount: 0 } : c
      );
      const messages = prev.messages.map((m) =>
        m.conversationId === conversationId && !m.readAt ? { ...m, readAt: new Date().toISOString() } : m
      );
      const next = { ...prev, conversations, messages };
      inboxStorage.setInboxData(next);
      return next;
    });
  }, []);

  const markNotificationRead = useCallback((id) => {
    if (typeof id === 'string' && id.startsWith(SERVER_NOTIFICATION_PREFIX)) {
      const rawId = id.slice(SERVER_NOTIFICATION_PREFIX.length);
      setServerNotifications((prev) => prev.map((n) => (String(n.id) === rawId ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n)));
      notificationsApi.markNotificationRead(rawId).catch(() => {});
      return;
    }

    setData((prev) => {
      const notifications = prev.notifications.map((n) =>
        n.id === id && !n.readAt ? { ...n, readAt: new Date().toISOString() } : n
      );
      const next = { ...prev, notifications };
      inboxStorage.setInboxData(next);
      return next;
    });
  }, []);

  const markAllNotificationsRead = useCallback(() => {
    const now = new Date().toISOString();
    setServerNotifications((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: now })));
    serverNotifications.filter((n) => !n.readAt).forEach((n) => {
      notificationsApi.markNotificationRead(n.id).catch(() => {});
    });

    setData((prev) => {
      const notifications = prev.notifications.map((n) => (n.readAt ? n : { ...n, readAt: now }));
      const next = { ...prev, notifications };
      inboxStorage.setInboxData(next);
      return next;
    });
  }, [serverNotifications]);

  const markConversationUnread = useCallback((conversationId) => {
    // Server conversations don't support marking unread server-side (no
    // endpoint) - local-only conversations keep the existing behavior.
    if (isServerConversationId(conversationId)) return;
    setData((prev) => {
      const conversations = prev.conversations.map((c) =>
        c.id === conversationId ? { ...c, unreadCount: Math.max(1, c.unreadCount) } : c
      );
      const next = { ...prev, conversations };
      inboxStorage.setInboxData(next);
      return next;
    });
  }, []);

  const deleteConversation = useCallback((conversationId) => {
    // Server conversations aren't deletable (they're the durable record of
    // a booking's messaging thread) - swipe-to-delete only applies to
    // local-only conversations.
    if (isServerConversationId(conversationId)) return;
    setData((prev) => {
      const conversations = prev.conversations.filter((c) => c.id !== conversationId);
      const messages = prev.messages.filter((m) => m.conversationId !== conversationId);
      const next = { ...prev, conversations, messages };
      inboxStorage.setInboxData(next);
      return next;
    });
  }, []);

  const markNotificationUnread = useCallback((id) => {
    if (typeof id === 'string' && id.startsWith(SERVER_NOTIFICATION_PREFIX)) return;
    setData((prev) => {
      const notifications = prev.notifications.map((n) => (n.id === id ? { ...n, readAt: null } : n));
      const next = { ...prev, notifications };
      inboxStorage.setInboxData(next);
      return next;
    });
  }, []);

  const deleteNotification = useCallback((id) => {
    if (typeof id === 'string' && id.startsWith(SERVER_NOTIFICATION_PREFIX)) {
      const rawId = id.slice(SERVER_NOTIFICATION_PREFIX.length);
      setData((prev) => {
        if (prev.dismissedServerNotificationIds.includes(rawId)) return prev;
        const next = { ...prev, dismissedServerNotificationIds: [...prev.dismissedServerNotificationIds, rawId] };
        inboxStorage.setInboxData(next);
        return next;
      });
      return;
    }

    setData((prev) => {
      const notifications = prev.notifications.filter((n) => n.id !== id);
      const next = { ...prev, notifications };
      inboxStorage.setInboxData(next);
      return next;
    });
  }, []);

  const conversations = useMemo(() => {
    const mappedServer = serverConversations.map(toLocalConversationShape);
    return [...data.conversations, ...mappedServer].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.lastMessageAt) - new Date(a.lastMessageAt);
    });
  }, [data.conversations, serverConversations]);

  const notifications = useMemo(() => {
    const dismissed = new Set(data.dismissedServerNotificationIds ?? []);
    const mappedServer = serverNotifications
      .filter((n) => !dismissed.has(String(n.id)))
      .map((n) => ({
        id: `${SERVER_NOTIFICATION_PREFIX}${n.id}`,
        type: n.type,
        title: n.title,
        body: n.body,
        bookingId: n.bookingId,
        createdAt: n.createdAt,
        readAt: n.readAt,
      }));
    return [...data.notifications, ...mappedServer].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [data.notifications, data.dismissedServerNotificationIds, serverNotifications]);

  const totalUnreadCount = useMemo(() => {
    const unreadMessages = conversations.reduce((sum, c) => sum + c.unreadCount, 0);
    const unreadNotifications = notifications.filter((n) => !n.readAt).length;
    return unreadMessages + unreadNotifications;
  }, [conversations, notifications]);

  const value = useMemo(() => ({
    conversations,
    notifications,
    isLoading,
    totalUnreadCount,
    getMessages,
    sendMessage,
    startInquiry,
    markConversationRead,
    markNotificationRead,
    markAllNotificationsRead,
    markConversationUnread,
    deleteConversation,
    markNotificationUnread,
    deleteNotification,
    notifyBookingEvent,
    syncMessages,
    syncServerConversations,
  }), [
    conversations, notifications, isLoading, totalUnreadCount, getMessages, sendMessage,
    startInquiry, markConversationRead, markNotificationRead, markAllNotificationsRead,
    markConversationUnread, deleteConversation, markNotificationUnread, deleteNotification, notifyBookingEvent,
    syncMessages, syncServerConversations,
  ]);

  return <InboxContext.Provider value={value}>{children}</InboxContext.Provider>;
}

export function useInbox() {
  const context = useContext(InboxContext);
  if (!context) {
    throw new Error('useInbox must be used within an InboxProvider');
  }
  return context;
}
