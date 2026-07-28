import { useMemo, useState } from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../constants/theme';
import { formatRelativeTime } from '../../constants/dateUtils';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useInbox } from '../../contexts/InboxContext';
import SwipeableRow from '../../components/SwipeableRow';
import ConfirmModal from '../../components/ConfirmModal';

const TABS = ['Messages', 'Notifications'];

const ROLE_ICONS = { Host: 'home-outline', Driver: 'car-outline', Support: 'headset-outline' };

const NOTIFICATION_ICONS = {
  booking_created: 'calendar-outline',
  booking_confirmed: 'checkmark-circle-outline',
  booking_modified: 'create-outline',
  booking_cancelled: 'close-circle-outline',
  payment: 'card-outline',
  reminder: 'alarm-outline',
};

function ConversationRow({ conversation, styles, colors }) {
  const roleIcon = ROLE_ICONS[conversation.participant.role] ?? 'person-outline';
  return (
    <View style={styles.row}>
      {conversation.participant.avatar ? (
        <Image source={{ uri: conversation.participant.avatar }} style={styles.avatarImage} />
      ) : (
        <View style={styles.avatarPlaceholder}>
          <Ionicons name={roleIcon} size={20} color={colors.teal} />
        </View>
      )}
      <View style={styles.rowInfo}>
        <View style={styles.rowTopLine}>
          <Text style={styles.rowName} numberOfLines={1}>{conversation.participant.name}</Text>
          <Text style={styles.rowTime}>{formatRelativeTime(conversation.lastMessageAt)}</Text>
        </View>
        <View style={styles.rowBottomLine}>
          <Text style={styles.rolePill}>{conversation.participant.role}</Text>
          <Text style={styles.rowPreview} numberOfLines={1}>{conversation.lastMessageText}</Text>
        </View>
      </View>
      {conversation.unreadCount > 0 && (
        <View style={styles.unreadBadge}>
          <Text style={styles.unreadBadgeText}>{conversation.unreadCount}</Text>
        </View>
      )}
    </View>
  );
}

function NotificationRow({ notification, styles, colors }) {
  const icon = NOTIFICATION_ICONS[notification.type] ?? 'notifications-outline';
  return (
    <View style={styles.row}>
      <View style={styles.notificationIcon}>
        <Ionicons name={icon} size={18} color={colors.teal} />
      </View>
      <View style={styles.rowInfo}>
        <View style={styles.rowTopLine}>
          <Text style={styles.rowName} numberOfLines={1}>{notification.title}</Text>
          <Text style={styles.rowTime}>{formatRelativeTime(notification.createdAt)}</Text>
        </View>
        <Text style={styles.rowPreview} numberOfLines={2}>{notification.body}</Text>
      </View>
      {!notification.readAt && <View style={styles.unreadDot} />}
    </View>
  );
}

export default function InboxScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {
    conversations, notifications, isLoading,
    markConversationRead, markNotificationRead, markAllNotificationsRead,
    markConversationUnread, deleteConversation, markNotificationUnread, deleteNotification,
  } = useInbox();
  const [activeTab, setActiveTab] = useState('Messages');
  const [pendingDelete, setPendingDelete] = useState(null);

  const unreadNotificationsCount = notifications.filter(n => !n.readAt).length;

  const openConversation = (conversation) => {
    markConversationRead(conversation.id);
    router.push(`/inbox/${conversation.id}`);
  };

  const openNotification = (notification) => {
    markNotificationRead(notification.id);
    if (notification.bookingId) router.push(`/booking/${notification.bookingId}?from=inbox`);
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    if (pendingDelete.type === 'conversation') deleteConversation(pendingDelete.id);
    else deleteNotification(pendingDelete.id);
    setPendingDelete(null);
  };

  const conversationActions = (conversation) => [
    conversation.unreadCount > 0
      ? { label: 'Read', icon: 'mail-open-outline', color: colors.teal, onPress: () => markConversationRead(conversation.id) }
      : { label: 'Unread', icon: 'mail-unread-outline', color: colors.warning, onPress: () => markConversationUnread(conversation.id) },
    { label: 'Delete', icon: 'trash-outline', color: colors.error, onPress: () => setPendingDelete({ type: 'conversation', id: conversation.id }) },
  ];

  const notificationActions = (notification) => [
    notification.readAt
      ? { label: 'Unread', icon: 'mail-unread-outline', color: colors.warning, onPress: () => markNotificationUnread(notification.id) }
      : { label: 'Read', icon: 'mail-open-outline', color: colors.teal, onPress: () => markNotificationRead(notification.id) },
    { label: 'Delete', icon: 'trash-outline', color: colors.error, onPress: () => setPendingDelete({ type: 'notification', id: notification.id }) },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Inbox</Text>
      </View>

      <View style={styles.tabRow}>
        {TABS.map((tab) => {
          const isActive = tab === activeTab;
          const count = tab === 'Messages' ? conversations.length : notifications.length;
          return (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                {tab}{count > 0 ? ` (${count})` : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {activeTab === 'Notifications' && unreadNotificationsCount > 0 && (
        <TouchableOpacity style={styles.markAllRow} onPress={markAllNotificationsRead}>
          <Text style={styles.markAllText}>Mark all as read</Text>
        </TouchableOpacity>
      )}

      {isLoading ? null : activeTab === 'Messages' ? (
        conversations.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="chatbubbles-outline" size={32} color={colors.disabled} />
            <Text style={styles.emptyStateText}>No messages yet.</Text>
          </View>
        ) : (
          <FlatList
            data={conversations}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <SwipeableRow colors={colors} onPress={() => openConversation(item)} actions={conversationActions(item)}>
                <ConversationRow conversation={item} styles={styles} colors={colors} />
              </SwipeableRow>
            )}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          />
        )
      ) : notifications.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="notifications-outline" size={32} color={colors.disabled} />
          <Text style={styles.emptyStateText}>No notifications yet.</Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <SwipeableRow colors={colors} onPress={() => openNotification(item)} actions={notificationActions(item)}>
              <NotificationRow notification={item} styles={styles} colors={colors} />
            </SwipeableRow>
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}

      <ConfirmModal
        visible={!!pendingDelete}
        title={pendingDelete?.type === 'conversation' ? 'Delete Conversation' : 'Delete Notification'}
        message={`Are you sure you want to delete this ${pendingDelete?.type === 'conversation' ? 'conversation' : 'notification'}? This cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      paddingTop: 20,
      paddingHorizontal: 16,
      paddingBottom: 12,
    },
    headerTitle: {
      fontFamily: FONTS.bold,
      fontSize: 20,
      color: colors.textPrimary,
    },
    tabRow: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      marginHorizontal: 16,
      borderRadius: 12,
      padding: 4,
      marginBottom: 8,
      shadowColor: colors.shadow,
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 2,
    },
    tab: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 9,
      alignItems: 'center',
    },
    tabActive: {
      backgroundColor: colors.teal,
    },
    tabText: {
      fontFamily: FONTS.medium,
      fontSize: 12,
      color: colors.textSubtle,
    },
    tabTextActive: {
      fontFamily: FONTS.semiBold,
      color: colors.white,
    },
    markAllRow: {
      alignItems: 'flex-end',
      paddingHorizontal: 16,
      marginBottom: 8,
    },
    markAllText: {
      fontFamily: FONTS.semiBold,
      fontSize: 12,
      color: colors.teal,
    },
    emptyState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingBottom: 80,
    },
    emptyStateText: {
      fontFamily: FONTS.regular,
      fontSize: 14,
      color: colors.textSubtle,
    },
    list: {
      paddingHorizontal: 16,
      paddingBottom: 20,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 12,
    },
    avatarImage: {
      width: 44,
      height: 44,
      borderRadius: 22,
    },
    avatarPlaceholder: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.highlight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    notificationIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.highlight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowInfo: {
      flex: 1,
      gap: 3,
    },
    rowTopLine: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    rowName: {
      flex: 1,
      fontFamily: FONTS.semiBold,
      fontSize: 14,
      color: colors.textPrimary,
    },
    rowTime: {
      fontFamily: FONTS.regular,
      fontSize: 11,
      color: colors.textSubtle,
    },
    rowBottomLine: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    rolePill: {
      fontFamily: FONTS.semiBold,
      fontSize: 10,
      color: colors.teal,
      backgroundColor: colors.highlight,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      overflow: 'hidden',
    },
    rowPreview: {
      flex: 1,
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textMuted,
    },
    unreadBadge: {
      minWidth: 20,
      height: 20,
      borderRadius: 10,
      paddingHorizontal: 5,
      backgroundColor: colors.teal,
      alignItems: 'center',
      justifyContent: 'center',
    },
    unreadBadgeText: {
      fontFamily: FONTS.bold,
      fontSize: 11,
      color: colors.white,
    },
    unreadDot: {
      width: 9,
      height: 9,
      borderRadius: 5,
      backgroundColor: colors.teal,
    },
  });
}
