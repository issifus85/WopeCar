import { useEffect, useMemo, useRef, useState } from 'react';
import {
  StyleSheet, Text, View, FlatList, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, Modal, Pressable, ActivityIndicator, Linking,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../constants/theme';
import { useAppTheme } from '../contexts/ThemeContext';
import { getChatAttachmentSignedUrl, openChatDocument } from '../services/chatAttachmentsApi';
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
// readAt (list_conversation_messages' new column, migration 0066) is that
// same "read by any other participant" moment as a real timestamp, not
// just a boolean - shown as "Read · 3:45 PM" so a read receipt visibly
// updates each time the other side actually opens the thread.
function MessageStatus({ message, styles, colors }) {
  if (message.senderId !== 'me') return null;
  if (message.isSending) {
    return <Text style={styles.bubbleStatus}>Sending...</Text>;
  }
  if (!message.isRead) {
    return <Text style={styles.bubbleStatus}>Delivered</Text>;
  }
  return (
    <Text style={[styles.bubbleStatus, { color: colors.teal }]}>
      {message.readAt ? `Read · ${formatMessageTime(message.readAt)}` : 'Read'}
    </Text>
  );
}

function ImageAttachment({ path, styles, colors, onPress }) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getChatAttachmentSignedUrl(path).then((resolved) => {
      if (!cancelled) setUrl(resolved);
    });
    return () => { cancelled = true; };
  }, [path]);

  if (!url) {
    return (
      <View style={styles.attachmentImagePlaceholder}>
        <ActivityIndicator size="small" color={colors.teal} />
      </View>
    );
  }

  return (
    <TouchableOpacity onPress={() => onPress(url)} activeOpacity={0.85}>
      <Image source={{ uri: url }} style={styles.attachmentImage} contentFit="cover" />
    </TouchableOpacity>
  );
}

function DocumentAttachment({ path, filename, styles, colors }) {
  const [isOpening, setIsOpening] = useState(false);

  const handlePress = async () => {
    setIsOpening(true);
    try {
      const url = await getChatAttachmentSignedUrl(path);
      if (url) await openChatDocument(url, filename || 'Document');
    } catch (e) {
      // Opening a shared document failing isn't worth a blocking modal -
      // the row just stops spinning and the user can tap again.
    } finally {
      setIsOpening(false);
    }
  };

  return (
    <TouchableOpacity style={styles.documentRow} onPress={handlePress} disabled={isOpening}>
      <Ionicons name="document-text-outline" size={20} color={colors.teal} />
      <Text style={styles.documentName} numberOfLines={1}>{filename || 'Document'}</Text>
      {isOpening && <ActivityIndicator size="small" color={colors.teal} />}
    </TouchableOpacity>
  );
}

function LocationAttachment({ meta, styles, colors }) {
  const handlePress = () => {
    if (meta?.lat == null || meta?.lng == null) return;
    Linking.openURL(`https://maps.google.com/?q=${meta.lat},${meta.lng}`);
  };

  return (
    <TouchableOpacity style={styles.locationRow} onPress={handlePress}>
      <Ionicons name="location" size={20} color={colors.teal} />
      <Text style={styles.locationText}>View Location</Text>
    </TouchableOpacity>
  );
}

function MessageBubble({ message, styles, colors, onViewImage }) {
  const isMe = message.senderId === 'me';
  const hasText = !!message.text || !!message.body;
  const text = message.text || message.body;

  return (
    <View style={[styles.bubbleRow, isMe && styles.bubbleRowMe]}>
      {!isMe && !!message.senderName && (
        <Text style={styles.bubbleSenderName}>{message.senderName}</Text>
      )}
      <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem, message.isSending && styles.bubbleSending]}>
        {message.attachmentType === 'image' && (
          <ImageAttachment path={message.attachmentUrl} styles={styles} colors={colors} onPress={onViewImage} />
        )}
        {message.attachmentType === 'document' && (
          <DocumentAttachment path={message.attachmentUrl} filename={message.attachmentMeta?.filename} styles={styles} colors={colors} />
        )}
        {message.attachmentType === 'location' && (
          <LocationAttachment meta={message.attachmentMeta} styles={styles} colors={colors} />
        )}
        {hasText && (
          <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe, !!message.attachmentType && styles.bubbleTextWithAttachment]}>
            {text}
          </Text>
        )}
      </View>
      <View style={[styles.bubbleMetaRow, isMe && styles.bubbleMetaRowMe]}>
        <Text style={styles.bubbleTime}>{formatMessageTime(message.createdAt)}</Text>
        <MessageStatus message={message} styles={styles} colors={colors} />
      </View>
    </View>
  );
}

const ATTACH_OPTIONS = [
  { kind: 'library', label: 'Photo Library', icon: 'images-outline' },
  { kind: 'camera', label: 'Camera', icon: 'camera-outline' },
  { kind: 'document', label: 'Document', icon: 'document-attach-outline' },
  { kind: 'location', label: 'Share Location', icon: 'location-outline' },
];

function AttachmentMenu({ visible, onClose, onSelect, styles, colors }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.menuBackdrop} onPress={onClose}>
        <Pressable style={styles.menuSheet} onPress={(e) => e.stopPropagation()}>
          {ATTACH_OPTIONS.map((option) => (
            <TouchableOpacity key={option.kind} style={styles.menuRow} onPress={() => onSelect(option.kind)}>
              <Ionicons name={option.icon} size={20} color={colors.teal} />
              <Text style={styles.menuRowText}>{option.label}</Text>
            </TouchableOpacity>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ImageViewerModal({ url, onClose, styles }) {
  return (
    <Modal visible={!!url} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.viewerBackdrop} onPress={onClose}>
        {!!url && <Image source={{ uri: url }} style={styles.viewerImage} contentFit="contain" />}
        <TouchableOpacity style={styles.viewerClose} onPress={onClose} hitSlop={12}>
          <Ionicons name="close" size={26} color="#fff" />
        </TouchableOpacity>
      </Pressable>
    </Modal>
  );
}

// Shared by the customer-facing Inbox thread (app/inbox/[id].js), the
// Ride Support thread (app/staff-inbox/[id].js), and Vendor Mode's Support
// tab (app/vendor/(tabs)/support.js) - same bubble list, pinned booking
// summary, and composer (including the safe-area bottom padding fix for the
// composer-cutoff bug), so no surface duplicates this. `extraBottomInset`
// is for the one tab-root caller (Support): unlike the two pushed detail
// screens, that one sits inside a Tabs group with FloatingTabBar overlaid
// on top, so its composer needs extra clearance to not end up hidden
// behind the pill.
//
// `onAttach(kind)` - kind is 'library' | 'camera' | 'document' | 'location'
// - is the parent screen's single hook for all four attachment types
// (mirrors onSend's "parent owns the actual side effect" shape). The
// parent is expected to pick/upload/geolocate (services/
// chatAttachmentsApi.js) and call its own sendMessage with the result;
// this component only awaits the returned promise to show a brief
// "Sending..." state and surface a failure inline, same posture as
// send's own optimistic-then-swap flow already has in InboxContext.
export default function MessageThread({
  messages, onSend, onAttach, pinnedSummary, emptyStateText = 'Say hello 👋', extraBottomInset = 0,
}) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [draft, setDraft] = useState('');
  const [isMenuVisible, setIsMenuVisible] = useState(false);
  const [isAttaching, setIsAttaching] = useState(false);
  const [attachError, setAttachError] = useState(null);
  const [viewerImageUrl, setViewerImageUrl] = useState(null);
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

  const handleAttach = async (kind) => {
    setIsMenuVisible(false);
    if (!onAttach) return;
    setAttachError(null);
    setIsAttaching(true);
    try {
      await onAttach(kind);
    } catch (e) {
      setAttachError(e.message || 'Could not send that. Please try again.');
    } finally {
      setIsAttaching(false);
    }
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
          renderItem={({ item }) => (
            <MessageBubble message={item} styles={styles} colors={colors} onViewImage={setViewerImageUrl} />
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}

      {!!attachError && (
        <View style={styles.attachErrorBanner}>
          <Text style={styles.attachErrorText}>{attachError}</Text>
        </View>
      )}

      <View style={[styles.composer, { paddingBottom: Math.max(12, insets.bottom) + extraBottomInset }]}>
        {!!onAttach && (
          <TouchableOpacity
            style={styles.attachButton}
            onPress={() => setIsMenuVisible(true)}
            disabled={isAttaching}
            hitSlop={6}
          >
            {isAttaching ? (
              <ActivityIndicator size="small" color={colors.teal} />
            ) : (
              <Ionicons name="add-circle-outline" size={26} color={colors.teal} />
            )}
          </TouchableOpacity>
        )}
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

      <AttachmentMenu
        visible={isMenuVisible}
        onClose={() => setIsMenuVisible(false)}
        onSelect={handleAttach}
        styles={styles}
        colors={colors}
      />
      <ImageViewerModal url={viewerImageUrl} onClose={() => setViewerImageUrl(null)} styles={styles} />
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
    bubbleTextWithAttachment: {
      marginTop: 8,
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
    attachmentImage: {
      width: 200,
      height: 150,
      borderRadius: 10,
    },
    attachmentImagePlaceholder: {
      width: 200,
      height: 150,
      borderRadius: 10,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    documentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      minWidth: 160,
    },
    documentName: {
      flex: 1,
      fontFamily: FONTS.medium,
      fontSize: 13,
      color: colors.textPrimary,
    },
    locationRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    locationText: {
      fontFamily: FONTS.medium,
      fontSize: 13,
      color: colors.textPrimary,
    },
    attachErrorBanner: {
      backgroundColor: colors.errorBg,
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    attachErrorText: {
      fontFamily: FONTS.medium,
      fontSize: 12,
      color: colors.error,
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
    attachButton: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
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
    menuBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'flex-end',
    },
    menuSheet: {
      backgroundColor: colors.background,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      paddingVertical: 8,
      paddingBottom: 24,
    },
    menuRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingHorizontal: 20,
      paddingVertical: 14,
    },
    menuRowText: {
      fontFamily: FONTS.medium,
      fontSize: 15,
      color: colors.textPrimary,
    },
    viewerBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.92)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    viewerImage: {
      width: '100%',
      height: '80%',
    },
    viewerClose: {
      position: 'absolute',
      top: 50,
      right: 20,
    },
  });
}
