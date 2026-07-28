import { useMemo, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../../constants/theme';
import { useAppTheme } from '../../../contexts/ThemeContext';
import { useVendor } from '../../../contexts/VendorContext';
import { sendLocalPushNotification } from '../../../services/pushNotifications';
import VendorHeader from '../../../components/VendorHeader';
import ConfirmModal from '../../../components/ConfirmModal';
import DeclineReasonModal from '../../../components/DeclineReasonModal';

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function VendorBookingsScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { bookingRequests, respondToBookingRequest, isLoading } = useVendor();
  const [acceptTarget, setAcceptTarget] = useState(null);
  const [declineTarget, setDeclineTarget] = useState(null);

  const handleAcceptConfirm = () => {
    const request = acceptTarget;
    respondToBookingRequest(request.id, { accept: true });
    // "Trigger a local notification to admin/support" - this app has no
    // cross-account push (see PROJECT.md's Known Gaps: push is local-only
    // everywhere), so a real on-device notification is the closest honest
    // stand-in within Vendor Mode's current mock-data scope.
    sendLocalPushNotification({
      title: 'Booking Accepted',
      body: `${request.carName} (${request.reference}) was accepted by the vendor.`,
    });
    setAcceptTarget(null);
  };

  const handleDeclineConfirm = (reason) => {
    respondToBookingRequest(declineTarget.id, { accept: false, reason });
    setDeclineTarget(null);
  };

  if (isLoading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="large" color={colors.teal} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <VendorHeader
        title="Booking Requests"
        subtitle={`${bookingRequests.length} pending`}
        showBack={false}
      />

      {bookingRequests.length === 0 ? (
        <View style={styles.centerState}>
          <Ionicons name="checkmark-circle-outline" size={40} color={colors.disabled} />
          <Text style={styles.emptyText}>No new booking requests.</Text>
        </View>
      ) : (
        <FlatList
          data={bookingRequests}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.carName}>{item.carName}</Text>
              <Text style={styles.reference}>{item.reference}</Text>

              <View style={styles.detailRow}>
                <Ionicons name="calendar-outline" size={14} color={colors.textSubtle} />
                <Text style={styles.detailText}>{formatDate(item.startDate)} - {formatDate(item.endDate)}</Text>
              </View>
              <View style={styles.detailRow}>
                <Ionicons name="time-outline" size={14} color={colors.textSubtle} />
                <Text style={styles.detailText}>Pickup {item.pickupTime} - Return {item.returnTime}</Text>
              </View>

              <View style={styles.actionsRow}>
                <TouchableOpacity style={styles.declineButton} onPress={() => setDeclineTarget(item)}>
                  <Text style={styles.declineButtonText}>Decline</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.acceptButton} onPress={() => setAcceptTarget(item)}>
                  <Text style={styles.acceptButtonText}>Accept</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}

      <ConfirmModal
        visible={!!acceptTarget}
        title="Accept Booking"
        message={acceptTarget ? `Accept this booking for ${acceptTarget.carName}? Admin/support will be notified.` : ''}
        confirmLabel="Accept"
        onConfirm={handleAcceptConfirm}
        onCancel={() => setAcceptTarget(null)}
      />

      <DeclineReasonModal
        visible={!!declineTarget}
        onCancel={() => setDeclineTarget(null)}
        onConfirm={handleDeclineConfirm}
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
    emptyText: {
      fontFamily: FONTS.regular,
      fontSize: 14,
      color: colors.textSubtle,
      textAlign: 'center',
    },
    list: {
      padding: 20,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 16,
      marginBottom: 12,
      gap: 6,
      shadowColor: colors.shadow,
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 3,
    },
    carName: {
      fontFamily: FONTS.bold,
      fontSize: 15,
      color: colors.textPrimary,
    },
    reference: {
      fontFamily: FONTS.medium,
      fontSize: 12,
      color: colors.teal,
      marginBottom: 4,
    },
    detailRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    detailText: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textMuted,
    },
    actionsRow: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 10,
    },
    declineButton: {
      flex: 1,
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: 'center',
      borderWidth: 1.5,
      borderColor: colors.error,
    },
    declineButtonText: {
      fontFamily: FONTS.semiBold,
      fontSize: 13,
      color: colors.error,
    },
    acceptButton: {
      flex: 1,
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: 'center',
      backgroundColor: colors.teal,
    },
    acceptButtonText: {
      fontFamily: FONTS.semiBold,
      fontSize: 13,
      color: colors.white,
    },
  });
}
