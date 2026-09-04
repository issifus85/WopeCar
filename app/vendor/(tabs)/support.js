import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../../constants/theme';
import { useAppTheme } from '../../../contexts/ThemeContext';
import { useInbox } from '../../../contexts/InboxContext';
import { pickAndUploadChatImage, pickAndUploadChatDocument, getCurrentLocationForChat } from '../../../services/chatAttachmentsApi';
import VendorHeader from '../../../components/VendorHeader';
import MessageThread from '../../../components/MessageThread';

// Was a fixed local-only 'conv-support' id that never actually reached
// Supabase (see migration 0067_vendor_support_conversation.sql's header
// comment for the full story - every message a vendor sent here was
// written to that device's own storage only, invisible to real staff).
// Now resolves a real, server-backed conversation on mount via
// startVendorSupport() - same "resolve once, then behave like any other
// server thread" shape app/car/[id].js's Inquiry flow already uses.
export default function VendorSupportScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { getMessages, sendMessage, markConversationRead, syncMessages, startVendorSupport } = useInbox();
  const [conversationId, setConversationId] = useState(null);
  const [hasLoadError, setHasLoadError] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  // Previously this just did startVendorSupport().then(setConversationId)
  // .catch(() => {}) - any failure (a real network hiccup, not just the "no
  // vendor row" exception the underlying RPC can raise) silently swallowed
  // the error and left the vendor stuck on an infinite spinner with no way
  // to recover short of leaving the tab. hasLoadError gives this the same
  // recover-in-place shape as the Dashboard's own "Couldn't load your
  // data" retry screen. `isMountedRef` is only checked on the mount-effect
  // call, not the Retry button's - a manual retry's own component is by
  // definition still mounted while its own await is in flight.
  const resolveConversation = useCallback((isMountedRef) => {
    setHasLoadError(false);
    return startVendorSupport()
      .then((id) => {
        if (!isMountedRef || isMountedRef.current) setConversationId(id);
      })
      .catch(() => {
        if (!isMountedRef || isMountedRef.current) setHasLoadError(true);
      });
  }, [startVendorSupport]);

  useEffect(() => {
    const isMountedRef = { current: true };
    resolveConversation(isMountedRef);
    return () => { isMountedRef.current = false; };
  }, [resolveConversation]);

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await resolveConversation();
    } finally {
      setIsRetrying(false);
    }
  };

  const messages = conversationId ? getMessages(conversationId) : [];

  // Same 5s poll + mark-read-on-every-tick pattern as the other two
  // server-backed threads (app/inbox/[id].js, app/staff-inbox/[id].js) -
  // see the read-receipt fix comment there for why markConversationRead
  // fires on every tick, not just once on mount.
  useEffect(() => {
    if (!conversationId) return;
    syncMessages(conversationId);
    markConversationRead(conversationId);
    const interval = setInterval(() => {
      syncMessages(conversationId);
      markConversationRead(conversationId);
    }, 5000);
    return () => clearInterval(interval);
  }, [conversationId, syncMessages, markConversationRead]);

  const handleAttach = async (kind) => {
    if (!conversationId) return;
    let attachment = null;
    if (kind === 'camera' || kind === 'library') {
      attachment = await pickAndUploadChatImage(conversationId, kind);
    } else if (kind === 'document') {
      attachment = await pickAndUploadChatDocument(conversationId);
    } else if (kind === 'location') {
      attachment = await getCurrentLocationForChat();
    }
    if (attachment) await sendMessage(conversationId, '', attachment);
  };

  if (!conversationId && hasLoadError) {
    return (
      <View style={styles.container}>
        <VendorHeader title="Vendor Support" subtitle="WopeCar Support - vendor & admin only" showBack={false} />
        <View style={styles.centerState}>
          <Ionicons name="cloud-offline-outline" size={40} color={colors.disabled} />
          <Text style={styles.errorText}>Couldn't open your support conversation. Check your connection and try again.</Text>
          <TouchableOpacity style={styles.retryButton} onPress={handleRetry} disabled={isRetrying}>
            <Text style={styles.retryButtonText}>{isRetrying ? 'Retrying…' : 'Retry'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!conversationId) {
    return (
      <View style={styles.container}>
        <VendorHeader title="Vendor Support" subtitle="WopeCar Support - vendor & admin only" showBack={false} />
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={colors.teal} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <VendorHeader
        title="Vendor Support"
        subtitle="WopeCar Support - vendor & admin only"
        showBack={false}
      />
      <MessageThread
        messages={messages}
        onSend={(text) => sendMessage(conversationId, text)}
        onAttach={handleAttach}
        emptyStateText="Message WopeCar Support about your listings, payouts, or bookings."
        extraBottomInset={80}
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
      gap: 8,
      padding: 20,
    },
    errorText: {
      fontFamily: FONTS.regular,
      fontSize: 14,
      color: colors.textSubtle,
      textAlign: 'center',
      lineHeight: 20,
    },
    retryButton: {
      backgroundColor: colors.teal,
      borderRadius: 12,
      paddingHorizontal: 24,
      paddingVertical: 13,
      marginTop: 4,
    },
    retryButtonText: {
      fontFamily: FONTS.semiBold,
      color: colors.white,
      fontSize: 14,
    },
  });
}
