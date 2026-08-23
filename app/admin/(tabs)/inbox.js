import ConversationListScreen from '../../../components/admin/ConversationListScreen';

// Admin Panel's Inbox tab - general support conversations only (no
// booking or car anchor). Previously a bare re-export of the same screen
// as Ride Support (app/staff-inbox/index.js); the two now genuinely
// diverge in data, sharing only ConversationListScreen.
export default function AdminInboxScreen() {
  return (
    <ConversationListScreen
      category="general"
      title="Inbox"
      subtitle="General support conversations, not tied to a specific booking or car."
    />
  );
}
