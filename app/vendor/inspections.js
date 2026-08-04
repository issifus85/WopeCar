import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useVendor } from '../../contexts/VendorContext';
import { useInspection } from '../../contexts/InspectionContext';
import { getInspection } from '../../services/inspectionsApi';
import VendorHeader from '../../components/VendorHeader';
import VendorStatusBadge from '../../components/VendorStatusBadge';

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// Mirrors app/booking/[id].js's inspectionStatusLabel/Style - reads real
// per-booking status fetched from the server (see the statuses state below)
// or the shared, single-slot InspectionContext draft for an in-progress one
// that hasn't synced yet.
function inspectionState(submitted, isDraftHere) {
  if (submitted?.status === 'submitted') return 'submitted';
  if (isDraftHere) return 'draft';
  return 'none';
}

function stateLabel(state) {
  if (state === 'submitted') return 'Completed';
  if (state === 'draft') return 'Resume Draft';
  return 'Not Started';
}

function stateStyle(state, colors) {
  if (state === 'submitted') return { color: colors.teal };
  if (state === 'draft') return { color: colors.warning };
  return null;
}

export default function VendorInspectionsScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { bookingHistory, isLoading } = useVendor();
  const { draft: inspectionDraft } = useInspection();
  const [statuses, setStatuses] = useState({});
  const [statusesLoading, setStatusesLoading] = useState(true);

  // Pre-inspection is available once a booking has been Confirmed (and
  // stays available through Completed, since that's the same booking's
  // later lifecycle state) - matches the renter-side rule in
  // app/booking/[id].js. Requested/Declined bookings aren't real rentals
  // yet, so there's nothing to inspect.
  const inspectable = bookingHistory.filter((b) => b.status === 'Confirmed' || b.status === 'Completed');
  const inspectableIds = inspectable.map((b) => b.id).join(',');

  useEffect(() => {
    if (!inspectableIds) {
      setStatusesLoading(false);
      return;
    }
    let cancelled = false;
    setStatusesLoading(true);
    const ids = inspectableIds.split(',');
    Promise.all(
      ids.flatMap((id) => [
        getInspection(id, 'pre').then((r) => [`${id}:pre`, r]).catch(() => [`${id}:pre`, null]),
        getInspection(id, 'post').then((r) => [`${id}:post`, r]).catch(() => [`${id}:post`, null]),
      ])
    ).then((entries) => {
      if (cancelled) return;
      setStatuses(Object.fromEntries(entries));
      setStatusesLoading(false);
    });
    return () => { cancelled = true; };
  }, [inspectableIds]);

  const handlePress = (booking, type) => {
    router.push({ pathname: '/vendor/inspection/mileage', params: { bookingId: booking.id, type } });
  };

  if (isLoading || statusesLoading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="large" color={colors.teal} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <VendorHeader
        title="Vehicle Inspections"
        subtitle="Pre & post-rental checklists"
        onBack={() => router.push('/vendor/menu')}
      />

      {inspectable.length === 0 ? (
        <View style={styles.centerState}>
          <Ionicons name="clipboard-outline" size={40} color={colors.disabled} />
          <Text style={styles.emptyText}>Confirmed bookings will show up here for inspection.</Text>
        </View>
      ) : (
        <FlatList
          data={inspectable}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const preInspection = statuses[`${item.id}:pre`];
            const postInspection = statuses[`${item.id}:post`];
            const preState = inspectionState(preInspection, inspectionDraft.bookingId === item.id && inspectionDraft.type === 'pre');
            const postState = inspectionState(postInspection, inspectionDraft.bookingId === item.id && inspectionDraft.type === 'post');
            const postLocked = preState !== 'submitted';

            return (
              <View style={styles.card}>
                <View style={styles.topRow}>
                  <Text style={styles.carName} numberOfLines={1}>{item.carName}</Text>
                  <VendorStatusBadge status={item.status} />
                </View>
                <Text style={styles.dateRange}>{formatDate(item.startDate)} - {formatDate(item.endDate)}</Text>

                <TouchableOpacity style={styles.row} onPress={() => handlePress(item, 'pre')}>
                  <Text style={styles.rowLabel}>Pre-Rental Inspection</Text>
                  <View style={styles.rowRight}>
                    <Text style={[styles.rowValue, stateStyle(preState, colors)]}>{stateLabel(preState)}</Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.textSubtle} />
                  </View>
                </TouchableOpacity>

                <TouchableOpacity style={styles.rowLast} onPress={() => handlePress(item, 'post')} disabled={postLocked}>
                  <Text style={styles.rowLabel}>Post-Rental Inspection</Text>
                  <View style={styles.rowRight}>
                    <Text style={[styles.rowValue, postLocked ? { color: colors.textSubtle } : stateStyle(postState, colors)]}>
                      {postLocked ? 'Locked' : stateLabel(postState)}
                    </Text>
                    {!postLocked && <Ionicons name="chevron-forward" size={16} color={colors.textSubtle} />}
                  </View>
                </TouchableOpacity>
              </View>
            );
          }}
        />
      )}
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
      marginBottom: 14,
      shadowColor: colors.shadow,
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 3,
    },
    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    carName: {
      fontFamily: FONTS.bold,
      fontSize: 15,
      color: colors.textPrimary,
      flexShrink: 1,
    },
    dateRange: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 4,
      marginBottom: 12,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
    },
    rowLast: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
    },
    rowRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    rowLabel: {
      fontFamily: FONTS.medium,
      fontSize: 13,
      color: colors.textPrimary,
    },
    rowValue: {
      fontFamily: FONTS.semiBold,
      fontSize: 13,
      color: colors.textMuted,
    },
  });
}
