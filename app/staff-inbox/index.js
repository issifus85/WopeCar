import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../constants/theme';
import { formatRelativeTime } from '../../constants/dateUtils';
import { useAppTheme } from '../../contexts/ThemeContext';
import * as conversationsApi from '../../services/conversationsApi';
import FilterTabs from '../../components/admin/FilterTabs';
import BadgeStatus from '../../components/admin/BadgeStatus';

const LIST_POLL_MS = 15000;

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'urgent', label: 'Urgent' },
  { key: 'resolved', label: 'Resolved' },
];

function ConversationRow({ conversation, styles, colors }) {
  const summary = conversation.pinnedSummary;
  const preview = conversation.lastMessage?.body ?? 'No messages yet.';
  return (
    <View style={styles.row}>
      <View style={styles.avatarPlaceholder}>
        <Ionicons name="person-outline" size={20} color={colors.teal} />
      </View>
      <View style={styles.rowInfo}>
        <View style={styles.rowTopLine}>
          <Text style={styles.rowName} numberOfLines={1}>{summary?.customerName ?? 'Customer'}</Text>
          {!!conversation.lastMessage && (
            <Text style={styles.rowTime}>{formatRelativeTime(conversation.lastMessage.createdAt)}</Text>
          )}
        </View>
        <Text style={styles.rowSubtitle} numberOfLines={1}>{summary?.carName}</Text>
        <Text style={styles.rowPreview} numberOfLines={1}>{preview}</Text>
        {(conversation.isUrgent || conversation.isResolved) && (
          <View style={styles.rowBadges}>
            {conversation.isUrgent && <BadgeStatus label="Urgent" tone="error" />}
            {conversation.isResolved && <BadgeStatus label="Resolved" tone="muted" />}
          </View>
        )}
      </View>
      {conversation.unreadCount > 0 && (
        <View style={styles.unreadBadge}>
          <Text style={styles.unreadBadgeText}>{conversation.unreadCount}</Text>
        </View>
      )}
    </View>
  );
}

export default function StaffInboxScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [conversations, setConversations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');

  const load = useCallback(() => {
    conversationsApi.getConversations({ scope: 'all' })
      .then(setConversations)
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, LIST_POLL_MS);
    return () => clearInterval(interval);
  }, [load]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const tabCounts = useMemo(() => ({
    all: conversations.length,
    unread: conversations.filter((c) => c.unreadCount > 0).length,
    urgent: conversations.filter((c) => c.isUrgent).length,
    resolved: conversations.filter((c) => c.isResolved).length,
  }), [conversations]);

  const filteredConversations = useMemo(() => {
    if (activeTab === 'unread') return conversations.filter((c) => c.unreadCount > 0);
    if (activeTab === 'urgent') return conversations.filter((c) => c.isUrgent);
    if (activeTab === 'resolved') return conversations.filter((c) => c.isResolved);
    return conversations;
  }, [conversations, activeTab]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Express Desk</Text>
        <Text style={styles.headerSubtitle}>Every client conversation, across all bookings</Text>
      </View>

      <FilterTabs
        tabs={TABS.map((t) => ({ ...t, count: tabCounts[t.key] }))}
        activeKey={activeTab}
        onChange={setActiveTab}
      />

      {isLoading ? null : filteredConversations.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="chatbubbles-outline" size={32} color={colors.disabled} />
          <Text style={styles.emptyStateText}>No conversations here.</Text>
        </View>
      ) : (
        <FlatList
          data={filteredConversations}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => router.push(`/staff-inbox/${item.id}`)}>
              <ConversationRow conversation={item} styles={styles} colors={colors} />
            </TouchableOpacity>
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
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
    headerSubtitle: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textSubtle,
      marginTop: 2,
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
      paddingBottom: 140,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 12,
      backgroundColor: colors.surface,
      borderRadius: 12,
      marginBottom: 10,
      shadowColor: colors.shadow,
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 2,
    },
    avatarPlaceholder: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.highlight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowInfo: {
      flex: 1,
      gap: 2,
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
    rowSubtitle: {
      fontFamily: FONTS.medium,
      fontSize: 11,
      color: colors.teal,
    },
    rowPreview: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textMuted,
    },
    rowBadges: {
      flexDirection: 'row',
      gap: 6,
      marginTop: 4,
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
  });
}
