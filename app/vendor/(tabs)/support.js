import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
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

  useEffect(() => {
    let cancelled = false;
    startVendorSupport().then((id) => {
      if (!cancelled) setConversationId(id);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [startVendorSupport]);

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
    },
  });
}
