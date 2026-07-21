import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as inboxStorage from '../services/inboxStorage';
import { sendLocalPushNotification, registerNotificationResponseHandler } from '../services/pushNotifications';
import { sendEmail } from '../services/emailService';
import { sendSms } from '../services/smsService';
import { useSettings } from './SettingsContext';
import { useAuth } from './AuthContext';
import { useBookings } from './BookingsContext';

const SUPPORT_CONVERSATION_ID = 'conv-support';
const REMINDER_WINDOW_MS = 24 * 60 * 60 * 1000;

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

function conversationIdFor({ carId, participant }) {
  if (participant.role === 'Support') return SUPPORT_CONVERSATION_ID;
  return `conv-${participant.role.toLowerCase()}-${carId}`;
}

const EMPTY_INBOX = { conversations: [], messages: [], notifications: [], remindedBookingIds: [] };

const InboxContext = createContext(null);

export function InboxProvider({ children }) {
  const [data, setData] = useState(EMPTY_INBOX);
  const [isLoading, setIsLoading] = useState(true);
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
    if (settings.emailNotifications && user?.email) {
      sendEmail({ to: user.email, subject: title, body });
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

  const startConversation = useCallback(({ participant, carId = null, bookingId = null, welcomeMessage = null }) => {
    const id = conversationIdFor({ carId, participant });

    setData((prev) => {
      const existing = prev.conversations.find((c) => c.id === id);
      if (existing) {
        if (bookingId && !existing.bookingId) {
          const conversations = prev.conversations.map((c) =>
            c.id === id ? { ...c, bookingId } : c
          );
          const next = { ...prev, conversations };
          inboxStorage.setInboxData(next);
          return next;
        }
        return prev;
      }

      const now = new Date().toISOString();
      const conversation = {
        id,
        participant,
        carId,
        bookingId,
        pinned: false,
        lastMessageText: welcomeMessage ?? '',
        lastMessageAt: now,
        unreadCount: welcomeMessage ? 1 : 0,
      };
      const messages = welcomeMessage
        ? [...prev.messages, {
            id: `msg-${Date.now()}`,
            conversationId: id,
            senderId: participant.id,
            text: welcomeMessage,
            createdAt: now,
            readAt: null,
          }]
        : prev.messages;

      const next = { ...prev, conversations: [...prev.conversations, conversation], messages };
      inboxStorage.setInboxData(next);

      if (welcomeMessage && settings.newMessages) {
        sendLocalPushNotification({
          title: participant.name,
          body: welcomeMessage,
          data: { url: `/inbox/${id}` },
        });
      }

      return next;
    });

    return id;
  }, [settings.newMessages]);

  const sendMessage = useCallback((conversationId, text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const now = new Date().toISOString();
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
  }, []);

  const getMessages = useCallback((conversationId) => {
    return data.messages
      .filter((m) => m.conversationId === conversationId)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  }, [data.messages]);

  const markConversationRead = useCallback((conversationId) => {
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
    setData((prev) => {
      const now = new Date().toISOString();
      const notifications = prev.notifications.map((n) => (n.readAt ? n : { ...n, readAt: now }));
      const next = { ...prev, notifications };
      inboxStorage.setInboxData(next);
      return next;
    });
  }, []);

  const markConversationUnread = useCallback((conversationId) => {
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
    setData((prev) => {
      const conversations = prev.conversations.filter((c) => c.id !== conversationId);
      const messages = prev.messages.filter((m) => m.conversationId !== conversationId);
      const next = { ...prev, conversations, messages };
      inboxStorage.setInboxData(next);
      return next;
    });
  }, []);

  const markNotificationUnread = useCallback((id) => {
    setData((prev) => {
      const notifications = prev.notifications.map((n) => (n.id === id ? { ...n, readAt: null } : n));
      const next = { ...prev, notifications };
      inboxStorage.setInboxData(next);
      return next;
    });
  }, []);

  const deleteNotification = useCallback((id) => {
    setData((prev) => {
      const notifications = prev.notifications.filter((n) => n.id !== id);
      const next = { ...prev, notifications };
      inboxStorage.setInboxData(next);
      return next;
    });
  }, []);

  const conversations = useMemo(() => {
    return [...data.conversations].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.lastMessageAt) - new Date(a.lastMessageAt);
    });
  }, [data.conversations]);

  const notifications = useMemo(() => {
    return [...data.notifications].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [data.notifications]);

  const totalUnreadCount = useMemo(() => {
    const unreadMessages = data.conversations.reduce((sum, c) => sum + c.unreadCount, 0);
    const unreadNotifications = data.notifications.filter((n) => !n.readAt).length;
    return unreadMessages + unreadNotifications;
  }, [data.conversations, data.notifications]);

  const value = useMemo(() => ({
    conversations,
    notifications,
    isLoading,
    totalUnreadCount,
    getMessages,
    sendMessage,
    startConversation,
    markConversationRead,
    markNotificationRead,
    markAllNotificationsRead,
    markConversationUnread,
    deleteConversation,
    markNotificationUnread,
    deleteNotification,
    notifyBookingEvent,
  }), [
    conversations, notifications, isLoading, totalUnreadCount, getMessages, sendMessage,
    startConversation, markConversationRead, markNotificationRead, markAllNotificationsRead,
    markConversationUnread, deleteConversation, markNotificationUnread, deleteNotification, notifyBookingEvent,
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
