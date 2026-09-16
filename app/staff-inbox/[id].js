import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import * as conversationsApi from '../../services/conversationsApi';
import { pickAndUploadChatImage, pickAndUploadChatDocument, getCurrentLocationForChat } from '../../services/chatAttachmentsApi';
import MessageThread from '../../components/MessageThread';
import InviteParticipantModal from '../../components/InviteParticipantModal';

const MESSAGE_POLL_MS = 5000;

export default function StaffConversationScreen() {
  const { id, from } = useLocalSearchParams();
  const router = useRouter();
  const navigation = useNavigation();
  const { colors } = useAppTheme();
  const { user } = useAuth();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isInviteVisible, setIsInviteVisible] = useState(false);
  const [isUpdatingFlags, setIsUpdatingFlags] = useState(false);

  // Reached from two different lists sharing this same route - the Admin
  // Panel's Inbox tab (category='general') and Ride Support (category=
  // 'support_ops', see ConversationListScreen's push call) - `from` (set
  // there) picks the right one to return to. Same root-level-screen-pushed-
  // from-a-nested-tab-navigator GO_BACK-unresolved fix as app/inbox/[id].js
  // and every other admin detail screen (canGoBack() isn't a safe guard
  // either, it reports true even in the broken state) - this screen never
  // got it originally, which is what made its back button occasionally do
  // nothing on repeated taps instead of just being slow.
  const handleBack = useCallback(() => {
    router.replace(from === 'general' ? '/admin/(tabs)/inbox' : '/staff-inbox');
  }, [router, from]);

  const backLabel = from === 'general' ? 'Inbox' : 'Ride Support';

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

  const loadMeta = useCallback(() => {
    conversationsApi.getConversation(id).then(setConversation).catch(() => {});
  }, [id]);

  const toggleFlag = (flag) => {
    if (!conversation || isUpdatingFlags) return;
    setIsUpdatingFlags(true);
    const patch = flag === 'urgent'
      ? { isUrgent: !conversation.isUrgent }
      : { isResolved: !conversation.isResolved };
    conversationsApi.setConversationFlags(id, patch)
      .then(loadMeta)
      .catch(() => {})
      .finally(() => setIsUpdatingFlags(false));
  };

  // Always re-fetches the latest window rather than only what's new -
  // otherwise a message's isRead flag flipping true (the other party
  // reading it) would never be picked up client-side once already cached,
  // since that doesn't mint a new message/id for a delta fetch to catch.
  const loadMessages = useCallback(() => {
    conversationsApi.getMessages(id).then(setMessages).catch(() => {});
  }, [id]);

  // markConversationRead fires on every poll tick, not just once on mount
  // (see the sibling comment in app/inbox/[id].js) - without this, a
  // message the customer sends while a staffer has this thread open would
  // never get marked read, since last_read_at only advances when this is
  // called.
  useEffect(() => {
    loadMeta();
    loadMessages();
    conversationsApi.markConversationRead(id).catch(() => {});
    const interval = setInterval(() => {
      loadMessages();
      conversationsApi.markConversationRead(id).catch(() => {});
    }, MESSAGE_POLL_MS);
    return () => clearInterval(interval);
  }, [id, loadMeta, loadMessages]);

  // Returned (not fire-and-forget) so MessageThread's handleSend/handleAttach
  // can catch a real failure and show it, instead of a send failing with no
  // feedback at all - previously the .catch(() => {}) here swallowed it.
  const handleSend = (text, attachment = null) => {
    return conversationsApi.sendMessage(id, text || null, attachment)
      .then(() => {
        loadMessages();
        loadMeta();
      });
  };

  const handleAttach = async (kind) => {
    let attachment = null;
    if (kind === 'camera' || kind === 'library') {
      attachment = await pickAndUploadChatImage(id, kind);
    } else if (kind === 'document') {
      attachment = await pickAndUploadChatDocument(id);
    } else if (kind === 'location') {
      attachment = await getCurrentLocationForChat();
    }
    if (attachment) await handleSend('', attachment);
  };

  const threadMessages = useMemo(() => messages.map((m) => ({
    id: m.id,
    conversationId: m.conversationId,
    senderId: m.senderId === user?.id ? 'me' : m.senderId,
    senderName: m.senderName,
    text: m.body,
    attachmentType: m.attachmentType ?? null,
    attachmentUrl: m.attachmentUrl ?? null,
    attachmentMeta: m.attachmentMeta ?? null,
    createdAt: m.createdAt,
    readAt: m.readAt ?? null,
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
        <TouchableOpacity
          onPress={() => toggleFlag('urgent')}
          disabled={isUpdatingFlags}
          hitSlop={10}
          style={styles.headerIconButton}
        >
          <Ionicons
            name={conversation.isUrgent ? 'alert-circle' : 'alert-circle-outline'}
            size={20}
            color={conversation.isUrgent ? colors.error : colors.textSubtle}
          />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => toggleFlag('resolved')}
          disabled={isUpdatingFlags}
          hitSlop={10}
          style={styles.headerIconButton}
        >
          <Ionicons
            name={conversation.isResolved ? 'checkmark-circle' : 'checkmark-circle-outline'}
            size={20}
            color={conversation.isResolved ? colors.success : colors.textSubtle}
          />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setIsInviteVisible(true)} hitSlop={10} style={styles.headerIconButton}>
          <Ionicons name="person-add-outline" size={20} color={colors.teal} />
        </TouchableOpacity>
      </View>

      <MessageThread
        messages={threadMessages}
        onSend={handleSend}
        onAttach={handleAttach}
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
    headerIconButton: {
      padding: 2,
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
