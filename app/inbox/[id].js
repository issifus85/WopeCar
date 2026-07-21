import { useEffect, useMemo, useRef, useState } from 'react';
import {
  StyleSheet, Text, View, FlatList, Image, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useInbox } from '../../contexts/InboxContext';

const ROLE_ICONS = { Host: 'home-outline', Driver: 'car-outline', Support: 'headset-outline' };

function formatMessageTime(iso) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function MessageBubble({ message, styles }) {
  const isMe = message.senderId === 'me';
  return (
    <View style={[styles.bubbleRow, isMe && styles.bubbleRowMe]}>
      <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
        <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>{message.text}</Text>
      </View>
      <Text style={[styles.bubbleTime, isMe && styles.bubbleTimeMe]}>{formatMessageTime(message.createdAt)}</Text>
    </View>
  );
}

export default function ConversationScreen() {
  const { id } = useLocalSearchParams();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { conversations, getMessages, sendMessage, markConversationRead } = useInbox();
  const [draft, setDraft] = useState('');
  const listRef = useRef(null);

  const conversation = conversations.find((c) => c.id === id);
  const messages = getMessages(id);

  useEffect(() => {
    markConversationRead(id);
  }, [id, markConversationRead]);

  useEffect(() => {
    const timer = setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 50);
    return () => clearTimeout(timer);
  }, [messages.length]);

  const handleSend = () => {
    if (!draft.trim()) return;
    sendMessage(id, draft);
    setDraft('');
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
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
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

      {messages.length === 0 ? (
        <View style={styles.centerState}>
          <Text style={styles.notFoundText}>Say hello 👋</Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <MessageBubble message={item} styles={styles} />}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}

      <View style={[styles.composer, { paddingBottom: Math.max(12, insets.bottom) }]}>
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
    bubbleTime: {
      fontFamily: FONTS.regular,
      fontSize: 10,
      color: colors.textSubtle,
      marginTop: 3,
    },
    bubbleTimeMe: {
      textAlign: 'right',
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
