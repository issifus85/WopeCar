import { useEffect, useMemo, useRef, useState } from 'react';
import {
  StyleSheet, Text, View, FlatList, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../constants/theme';
import { useAppTheme } from '../contexts/ThemeContext';
import PinnedBookingSummary from './PinnedBookingSummary';

function formatMessageTime(iso) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

// Delivered/Read status only ever shows on the viewer's own sent messages
// (matches standard chat conventions - there's no reason to show it on a
// message someone else sent you). "Read" means read by any OTHER
// participant, not necessarily everyone, since a thread can have more than
// two people (e.g. an invited driver) - see buildPinnedSummary's sibling
// comment on the backend, ConversationController::formatMessage().
function MessageStatus({ message, styles, colors }) {
  if (message.senderId !== 'me') return null;
  if (message.isSending) {
    return <Text style={styles.bubbleStatus}>Sending...</Text>;
  }
  return (
    <Text style={[styles.bubbleStatus, message.isRead && { color: colors.teal }]}>
      {message.isRead ? 'Read' : 'Delivered'}
    </Text>
  );
}

function MessageBubble({ message, styles, colors }) {
  const isMe = message.senderId === 'me';
  return (
    <View style={[styles.bubbleRow, isMe && styles.bubbleRowMe]}>
      {!isMe && !!message.senderName && (
        <Text style={styles.bubbleSenderName}>{message.senderName}</Text>
      )}
      <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem, message.isSending && styles.bubbleSending]}>
        <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>{message.text}</Text>
      </View>
      <View style={[styles.bubbleMetaRow, isMe && styles.bubbleMetaRowMe]}>
        <Text style={styles.bubbleTime}>{formatMessageTime(message.createdAt)}</Text>
        <MessageStatus message={message} styles={styles} colors={colors} />
      </View>
    </View>
  );
}

// Shared by the customer-facing Inbox thread (app/inbox/[id].js), the
// Express Desk thread (app/staff-inbox/[id].js), and Vendor Mode's Support
// tab (app/vendor/(tabs)/support.js) - same bubble list, pinned booking
// summary, and composer (including the safe-area bottom padding fix for the
// composer-cutoff bug), so no surface duplicates this. `extraBottomInset`
// is for the one tab-root caller (Support): unlike the two pushed detail
// screens, that one sits inside a Tabs group with FloatingTabBar overlaid
// on top, so its composer needs extra clearance to not end up hidden
// behind the pill.
export default function MessageThread({ messages, onSend, pinnedSummary, emptyStateText = 'Say hello 👋', extraBottomInset = 0 }) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [draft, setDraft] = useState('');
  const listRef = useRef(null);

  useEffect(() => {
    const timer = setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 50);
    return () => clearTimeout(timer);
  }, [messages.length]);

  const handleSend = () => {
    if (!draft.trim()) return;
    onSend(draft);
    setDraft('');
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {!!pinnedSummary && <PinnedBookingSummary summary={pinnedSummary} />}

      {messages.length === 0 ? (
        <View style={styles.centerState}>
          <Text style={styles.notFoundText}>{emptyStateText}</Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => <MessageBubble message={item} styles={styles} colors={colors} />}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}

      <View style={[styles.composer, { paddingBottom: Math.max(12, insets.bottom) + extraBottomInset }]}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="Type a message..."
          placeholderTextColor={colors.textSubtle}
          multiline
        />
        <TouchableOpacity
          style={[styles.sendButton, !draft.trim() && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!draft.trim()}
        >
          <Ionicons name="send" size={18} color={colors.white} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
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
    list: {
      padding: 16,
      gap: 10,
    },
    bubbleRow: {
      alignItems: 'flex-start',
      marginBottom: 4,
      maxWidth: '80%',
    },
    bubbleRowMe: {
      alignSelf: 'flex-end',
      alignItems: 'flex-end',
    },
    bubbleSenderName: {
      fontFamily: FONTS.semiBold,
      fontSize: 10,
      color: colors.textSubtle,
      marginBottom: 2,
      marginLeft: 2,
    },
    bubble: {
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    bubbleThem: {
      backgroundColor: colors.surface,
      borderBottomLeftRadius: 4,
    },
    bubbleMe: {
      backgroundColor: colors.teal,
      borderBottomRightRadius: 4,
    },
    bubbleText: {
      fontFamily: FONTS.regular,
      fontSize: 14,
      color: colors.textPrimary,
      lineHeight: 20,
    },
    bubbleTextMe: {
      color: colors.white,
    },
    bubbleSending: {
      opacity: 0.6,
    },
    bubbleMetaRow: {
      flexDirection: 'row',
      gap: 6,
      marginTop: 3,
    },
    bubbleMetaRowMe: {
      flexDirection: 'row-reverse',
    },
    bubbleTime: {
      fontFamily: FONTS.regular,
      fontSize: 10,
      color: colors.textSubtle,
    },
    bubbleStatus: {
      fontFamily: FONTS.regular,
      fontSize: 10,
      color: colors.textSubtle,
    },
    composer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 10,
      padding: 12,
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
    },
    input: {
      flex: 1,
      fontFamily: FONTS.regular,
      fontSize: 14,
      color: colors.textPrimary,
      backgroundColor: colors.background,
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingVertical: 10,
      maxHeight: 100,
      borderWidth: 1,
      borderColor: colors.border,
    },
    sendButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.teal,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendButtonDisabled: {
      backgroundColor: colors.disabled,
    },
  });
}
