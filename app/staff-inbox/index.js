import ConversationListScreen from '../../components/admin/ConversationListScreen';

// "Ride Support" - booking/car-inquiry conversations only. Reached from the
// Profile menu's is_support-gated row. Distinct from the Admin Panel's
// Inbox tab (app/admin/(tabs)/inbox.js), which covers general (no booking/
// car anchor) conversations - both share ConversationListScreen, scoped by
// category via list_conversations' p_category param.
export default function StaffInboxScreen() {
  return (
    <ConversationListScreen
      category="support_ops"
      title="Ride Support"
      subtitle="Renter conversations, anchored to each booking or car inquiry."
    />
  );
}
