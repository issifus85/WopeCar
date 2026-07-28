import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useAppTheme } from '../../../contexts/ThemeContext';
import { useInbox } from '../../../contexts/InboxContext';
import VendorHeader from '../../../components/VendorHeader';
import MessageThread from '../../../components/MessageThread';

// Vendor Mode is a toggle on the same account, not a separate login - so
// this reuses the exact same permanent "WopeCar Support" conversation the
// renter side already seeds in InboxContext (SUPPORT_CONVERSATION_ID), one
// unified support thread for the account rather than a second, fragmented
// one. There is no peer-to-peer renter<->vendor messaging surface here or
// anywhere in Vendor Mode - only this single admin/support thread.
const SUPPORT_CONVERSATION_ID = 'conv-support';

export default function VendorSupportScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { getMessages, sendMessage, markConversationRead } = useInbox();

  const messages = getMessages(SUPPORT_CONVERSATION_ID);

  useEffect(() => {
    markConversationRead(SUPPORT_CONVERSATION_ID);
  }, [markConversationRead]);

  return (
    <View style={styles.container}>
      <VendorHeader
        title="Vendor Support"
        subtitle="WopeCar Support - vendor & admin only"
        showBack={false}
      />
      <MessageThread
        messages={messages}
        onSend={(text) => sendMessage(SUPPORT_CONVERSATION_ID, text)}
        emptyStateText="Message WopeCar Support about your listings, payouts, or bookings."
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
  });
}
