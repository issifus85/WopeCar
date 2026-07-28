import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import * as conversationsApi from '../../services/conversationsApi';
import MessageThread from '../../components/MessageThread';
import InviteParticipantModal from '../../components/InviteParticipantModal';

const MESSAGE_POLL_MS = 5000;

export default function StaffConversationScreen() {
  const { id } = useLocalSearchParams();
  const { colors } = useAppTheme();
  const { user } = useAuth();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isInviteVisible, setIsInviteVisible] = useState(false);

  const loadMeta = useCallback(() => {
    conversationsApi.getConversation(id).then(setConversation).catch(() => {});
  }, [id]);

  // Always re-fetches the latest window rather than only what's new -
  // otherwise a message's isRead flag flipping true (the other party
  // reading it) would never be picked up client-side once already cached,
  // since that doesn't mint a new message/id for a delta fetch to catch.
  const loadMessages = useCallback(() => {
    conversationsApi.getMessages(id).then(setMessages).catch(() => {});
  }, [id]);

  useEffect(() => {
    loadMeta();
    loadMessages();
    const interval = setInterval(loadMessages, MESSAGE_POLL_MS);
    return () => clearInterval(interval);
  }, [id, loadMeta, loadMessages]);

  useEffect(() => {
    conversationsApi.markConversationRead(id).catch(() => {});
  }, [id]);

  const handleSend = (text) => {
    conversationsApi.sendMessage(id, text)
      .then(() => {
        loadMessages();
        loadMeta();
      })
      .catch(() => {});
  };

  const threadMessages = useMemo(() => messages.map((m) => ({
    id: m.id,
    conversationId: m.conversationId,
    senderId: m.senderId === user?.id ? 'me' : m.senderId,
    senderName: m.senderName,
    text: m.body,
    createdAt: m.createdAt,
    isRead: !!m.isRead,
    isSending: typeof m.id === 'string' && m.id.startsWith('pending-'),
  })), [messages, user]);

  if (!conversation) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="large" color={colors.teal} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.headerAvatar}>
          <Ionicons name="person-outline" size={18} color={colors.teal} />
        </View>
        <View style={styles.headerTextWrap}>
          <Text style={styles.headerName} numberOfLines={1}>{conversation.pinnedSummary?.customerName ?? 'Customer'}</Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>{conversation.pinnedSummary?.carName}</Text>
        </View>
        <TouchableOpacity onPress={() => setIsInviteVisible(true)} hitSlop={10}>
          <Ionicons name="person-add-outline" size={20} color={colors.teal} />
        </TouchableOpacity>
      </View>

      <MessageThread
        messages={threadMessages}
        onSend={handleSend}
        pinnedSummary={conversation.pinnedSummary}
        emptyStateText="No messages yet."
      />

      <InviteParticipantModal
        visible={isInviteVisible}
        onClose={() => setIsInviteVisible(false)}
        conversationId={id}
        onInvited={() => {
          setIsInviteVisible(false);
          loadMeta();
        }}
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
    centerState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 14,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    headerAvatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.highlight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTextWrap: {
      flex: 1,
    },
    headerName: {
      fontFamily: FONTS.semiBold,
      fontSize: 15,
      color: colors.textPrimary,
    },
    headerSubtitle: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textSubtle,
    },
  });
}
