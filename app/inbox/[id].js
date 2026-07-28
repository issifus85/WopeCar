import { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useInbox } from '../../contexts/InboxContext';
import MessageThread from '../../components/MessageThread';

const ROLE_ICONS = { Host: 'home-outline', Driver: 'car-outline', Support: 'headset-outline' };

export default function ConversationScreen() {
  const { id } = useLocalSearchParams();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { conversations, getMessages, sendMessage, markConversationRead, syncMessages } = useInbox();

  const conversation = conversations.find((c) => c.id === id);
  const messages = getMessages(id);
  const isServerConversation = id?.startsWith('booking-');

  useEffect(() => {
    markConversationRead(id);
  }, [id, markConversationRead]);

  // Server conversations (booking-anchored, see InboxContext.js) are
  // polled rather than pushed - no websocket infra is wired up for this
  // pass. 5s while this thread is open; the conversation list itself
  // polls separately, less frequently, from InboxContext.
  useEffect(() => {
    if (!isServerConversation) return;
    syncMessages(id);
    const interval = setInterval(() => syncMessages(id), 5000);
    return () => clearInterval(interval);
  }, [id, isServerConversation, syncMessages]);

  if (!conversation) {
    return (
      <View style={styles.centerState}>
        <Text style={styles.notFoundText}>Conversation not found.</Text>
      </View>
    );
  }

  const roleIcon = ROLE_ICONS[conversation.participant.role] ?? 'person-outline';

  return (
    <View style={styles.container}>
      <View style={styles.participantHeader}>
        {conversation.participant.avatar ? (
          <Image source={{ uri: conversation.participant.avatar }} style={styles.avatarImage} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Ionicons name={roleIcon} size={18} color={colors.teal} />
          </View>
        )}
        <View>
          <Text style={styles.participantName}>{conversation.participant.name}</Text>
          <Text style={styles.participantRole}>{conversation.participant.role}</Text>
        </View>
      </View>

      <MessageThread
        messages={messages}
        onSend={(text) => sendMessage(id, text)}
        pinnedSummary={conversation.pinnedSummary}
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
    },
    notFoundText: {
      fontFamily: FONTS.regular,
      fontSize: 14,
      color: colors.textMuted,
    },
    participantHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 14,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    avatarImage: {
      width: 36,
      height: 36,
      borderRadius: 18,
    },
    avatarPlaceholder: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.highlight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    participantName: {
      fontFamily: FONTS.semiBold,
      fontSize: 15,
      color: colors.textPrimary,
    },
    participantRole: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textSubtle,
    },
  });
}
