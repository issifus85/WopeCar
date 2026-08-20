import { useCallback, useEffect, useLayoutEffect, useMemo } from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useInbox } from '../../contexts/InboxContext';
import MessageThread from '../../components/MessageThread';
import { pickAndUploadChatImage, pickAndUploadChatDocument, getCurrentLocationForChat } from '../../services/chatAttachmentsApi';

const ROLE_ICONS = { Host: 'home-outline', Driver: 'car-outline', Support: 'headset-outline' };

export default function ConversationScreen() {
  const { id, from, carId, bookingId } = useLocalSearchParams();
  const router = useRouter();
  const navigation = useNavigation();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { conversations, getMessages, sendMessage, markConversationRead, syncMessages } = useInbox();

  // Reached from three different places (Inbox hub, Car Details, Booking
  // Details - see app/inbox/index.js, app/car/[id].js's handleInquiry,
  // app/booking/[id].js's handleMessageParticipant), each pushed from
  // inside a nested tab navigator itself - the same GO_BACK-unresolved-on-
  // web fix as protection-plan.js/account.js, but with `from` (set by the
  // car/booking call sites) picking the right destination since there's no
  // single default to fall back to.
  const handleBack = useCallback(() => {
    if (from === 'car' && carId) {
      router.replace(`/car/${carId}`);
      return;
    }
    if (from === 'booking' && bookingId) {
      router.replace(`/booking/${bookingId}`);
      return;
    }
    router.replace('/inbox');
  }, [router, from, carId, bookingId]);

  const backLabel = from === 'car' ? 'Car Details' : from === 'booking' ? 'Booking' : 'Inbox';

  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <TouchableOpacity onPress={handleBack} hitSlop={10} style={styles.headerBackButton}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          <Text style={styles.headerBackLabel}>{backLabel}</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, handleBack, styles, colors, backLabel]);

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
  //
  // markConversationRead also fires on every tick, not just the mount-only
  // call above - without this, a message the other party sends while this
  // screen stays open would never actually get marked read (last_read_at
  // only advances when this is called), so their "Read" receipt would
  // never flip even though the thread is sitting open in front of the
  // viewer right now. Cheap and idempotent (just bumps a timestamp).
  useEffect(() => {
    if (!isServerConversation) return;
    syncMessages(id);
    markConversationRead(id);
    const interval = setInterval(() => {
      syncMessages(id);
      markConversationRead(id);
    }, 5000);
    return () => clearInterval(interval);
  }, [id, isServerConversation, syncMessages, markConversationRead]);

  const handleAttach = async (kind) => {
    let attachment = null;
    if (kind === 'camera' || kind === 'library') {
      attachment = await pickAndUploadChatImage(id, kind);
    } else if (kind === 'document') {
      attachment = await pickAndUploadChatDocument(id);
    } else if (kind === 'location') {
      attachment = await getCurrentLocationForChat();
    }
    if (attachment) sendMessage(id, '', attachment);
  };

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
        onAttach={handleAttach}
        pinnedSummary={conversation.pinnedSummary}
      />
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    headerBackButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingRight: 8,
    },
    headerBackLabel: {
      fontFamily: FONTS.regular,
      fontSize: 17,
      color: colors.textPrimary,
      marginLeft: -4,
    },
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
