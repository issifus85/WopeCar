import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, FlatList, RefreshControl, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import { formatCurrency } from '../../constants/pricing';
import FilterTabs from '../../components/admin/FilterTabs';
import BadgeStatus from '../../components/admin/BadgeStatus';
import ConfirmModal from '../../components/ConfirmModal';
import ReasonModal from '../../components/admin/ReasonModal';
import VendorDocumentsModal from '../../components/admin/VendorDocumentsModal';
import RecordPayoutModal from '../../components/admin/RecordPayoutModal';
import { listVendors, getVendorStats, approveVendor, rejectVendor, recordVendorPayout } from '../../services/adminVendorsApi';

const DOC_STATUS_TONE = { not_submitted: 'muted', under_review: 'warning', verified: 'success', rejected: 'error' };
const DOC_STATUS_LABEL = { not_submitted: 'Not Submitted', under_review: 'Under Review', verified: 'Verified', rejected: 'Rejected' };

function VendorCard({ vendor, stats, isPending, onApprove, onReject, onReviewDocuments, onRecordPayout, styles, colors }) {
  const owner = vendor.users;
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(vendor.business_name || owner?.full_name || '?').charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.cardHeaderInfo}>
          <Text style={styles.businessName} numberOfLines={1}>{vendor.business_name || 'Unnamed Business'}</Text>
          <Text style={styles.ownerName} numberOfLines={1}>{owner?.full_name || 'Unknown owner'}</Text>
        </View>
        <BadgeStatus label={isPending ? 'Pending' : 'Approved'} tone={isPending ? 'warning' : 'success'} />
      </View>

      <View style={styles.fieldsGrid}>
        <View style={styles.fieldItem}>
          <Text style={styles.fieldLabel}>Email</Text>
          <Text style={styles.fieldValue} numberOfLines={1}>{owner?.email || '—'}</Text>
        </View>
        <View style={styles.fieldItem}>
          <Text style={styles.fieldLabel}>Phone</Text>
          <Text style={styles.fieldValue} numberOfLines={1}>{owner?.phone || '—'}</Text>
        </View>
        <View style={styles.fieldItem}>
          <Text style={styles.fieldLabel}>Ghana Card ID</Text>
          <Text style={styles.fieldValue} numberOfLines={1}>{vendor.ghana_card_id || '—'}</Text>
        </View>
        <View style={styles.fieldItem}>
          <Text style={styles.fieldLabel}>Bank Details</Text>
          <Text style={styles.fieldValue} numberOfLines={1}>
            {vendor.bank_name ? `${vendor.bank_name} · ${vendor.bank_account || ''}` : 'Not provided'}
          </Text>
        </View>
        <View style={styles.fieldItem}>
          <Text style={styles.fieldLabel}>Date Applied</Text>
          <Text style={styles.fieldValue}>{new Date(vendor.created_at).toLocaleDateString()}</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.docsRow} onPress={onReviewDocuments}>
        <View style={styles.docsRowLeft}>
          <Ionicons name="document-text-outline" size={16} color={colors.textSubtle} />
          <Text style={styles.docsRowLabel}>Verification Documents</Text>
        </View>
        <View style={styles.docsRowBadges}>
          <BadgeStatus label={DOC_STATUS_LABEL[vendor.id_document_status] ?? 'Not Submitted'} tone={DOC_STATUS_TONE[vendor.id_document_status] ?? 'muted'} />
          <Ionicons name="chevron-forward" size={16} color={colors.textSubtle} />
        </View>
      </TouchableOpacity>

      {!isPending && (
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{formatCurrency(vendor.total_earnings || 0)}</Text>
            <Text style={styles.statLabel}>Total Earnings</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats?.activeCars ?? '…'}</Text>
            <Text style={styles.statLabel}>Active Cars</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats?.totalBookings ?? '…'}</Text>
            <Text style={styles.statLabel}>Total Bookings</Text>
          </View>
        </View>
      )}

      {!isPending && (
        <TouchableOpacity style={styles.payoutButton} onPress={onRecordPayout}>
          <Ionicons name="cash-outline" size={16} color={colors.teal} />
          <Text style={styles.payoutButtonText}>Record Payout</Text>
        </TouchableOpacity>
      )}

      {isPending && (
        <View style={styles.actions}>
          <TouchableOpacity style={styles.rejectButton} onPress={onReject}>
            <Ionicons name="close-circle-outline" size={16} color={colors.error} />
            <Text style={styles.rejectButtonText}>Reject</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.approveButton} onPress={onApprove}>
            <Ionicons name="checkmark-circle-outline" size={16} color={colors.white} />
            <Text style={styles.approveButtonText}>Approve</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

export default function AdminVendorsScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [tab, setTab] = useState('pending');
  const [vendors, setVendors] = useState([]);
  const [statsById, setStatsById] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [pendingApprove, setPendingApprove] = useState(null);
  const [pendingReject, setPendingReject] = useState(null);
  const [documentsVendor, setDocumentsVendor] = useState(null);
  const [payoutVendor, setPayoutVendor] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await listVendors({ approved: tab === 'approved' });
      setVendors(data);
      if (tab === 'approved') {
        const entries = await Promise.all(data.map(async (v) => [v.id, await getVendorStats(v.id)]));
        setStatsById(Object.fromEntries(entries));
      }
    } catch (e) {
      setError(e.message || 'Could not load vendors.');
    }
  }, [tab]);

  useEffect(() => {
    setIsLoading(true);
    load().finally(() => setIsLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  }, [load]);

  const handleApprove = async () => {
    setIsSaving(true);
    try {
      await approveVendor(pendingApprove);
      setPendingApprove(null);
      await load();
    } catch (e) {
      setError(e.message || 'Could not approve vendor.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReject = async (reason) => {
    setIsSaving(true);
    try {
      await rejectVendor(pendingReject, reason);
      setPendingReject(null);
      await load();
    } catch (e) {
      setError(e.message || 'Could not reject vendor.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRecordPayout = async ({ amount, note }) => {
    setIsSaving(true);
    try {
      await recordVendorPayout(payoutVendor, { amount, note });
      setPayoutVendor(null);
    } catch (e) {
      setError(e.message || 'Could not record payout.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <FilterTabs
        tabs={[{ key: 'pending', label: 'Pending' }, { key: 'approved', label: 'Approved' }]}
        activeKey={tab}
        onChange={setTab}
      />

      {!!error && <Text style={styles.errorText}>{error}</Text>}

      {isLoading ? (
        <ActivityIndicator size="large" color={colors.teal} style={styles.loading} />
      ) : (
        <FlatList
          data={vendors}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <VendorCard
              vendor={item}
              stats={statsById[item.id]}
              isPending={tab === 'pending'}
              onApprove={() => setPendingApprove(item)}
              onReject={() => setPendingReject(item)}
              onReviewDocuments={() => setDocumentsVendor(item)}
              onRecordPayout={() => setPayoutVendor(item)}
              styles={styles}
              colors={colors}
            />
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.teal} />}
          ListEmptyComponent={<Text style={styles.emptyText}>No {tab} vendors.</Text>}
        />
      )}

      <ConfirmModal
        visible={!!pendingApprove}
        title="Approve this vendor?"
        message={`${pendingApprove?.business_name || 'This vendor'} will be approved and notified. Their account role will be upgraded to vendor.`}
        confirmLabel={isSaving ? 'Approving…' : 'Approve'}
        onConfirm={handleApprove}
        onCancel={() => setPendingApprove(null)}
      />
      <ReasonModal
        visible={!!pendingReject}
        title="Reject Vendor Application"
        placeholder="Reason for rejection..."
        submitLabel="Send & Reject"
        onCancel={() => setPendingReject(null)}
        onSubmit={handleReject}
      />
      <VendorDocumentsModal
        visible={!!documentsVendor}
        vendor={documentsVendor}
        onClose={() => setDocumentsVendor(null)}
        onChanged={load}
      />
      <RecordPayoutModal
        visible={!!payoutVendor}
        vendor={payoutVendor}
        isSaving={isSaving}
        onCancel={() => setPayoutVendor(null)}
        onSubmit={handleRecordPayout}
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
    loading: {
      marginTop: 40,
    },
    errorText: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.error,
      textAlign: 'center',
      marginTop: 8,
    },
    list: {
      paddingHorizontal: 16,
      paddingBottom: 24,
    },
    emptyText: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textSubtle,
      textAlign: 'center',
      marginTop: 40,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 14,
      marginBottom: 12,
      shadowColor: colors.shadow,
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 2,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 12,
    },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.highlight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: {
      fontFamily: FONTS.bold,
      fontSize: 15,
      color: colors.teal,
    },
    cardHeaderInfo: {
      flex: 1,
    },
    businessName: {
      fontFamily: FONTS.bold,
      fontSize: 14,
      color: colors.textPrimary,
    },
    ownerName: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textSubtle,
    },
    fieldsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginBottom: 4,
    },
    fieldItem: {
      flexBasis: '47%',
    },
    fieldLabel: {
      fontFamily: FONTS.regular,
      fontSize: 10,
      color: colors.textSubtle,
    },
    fieldValue: {
      fontFamily: FONTS.medium,
      fontSize: 13,
      color: colors.textPrimary,
      marginTop: 1,
    },
    docsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 4,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
    },
    docsRowLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    docsRowLabel: {
      fontFamily: FONTS.medium,
      fontSize: 13,
      color: colors.textPrimary,
    },
    docsRowBadges: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    statsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 12,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
    },
    statItem: {
      alignItems: 'center',
    },
    statValue: {
      fontFamily: FONTS.bold,
      fontSize: 14,
      color: colors.textPrimary,
    },
    statLabel: {
      fontFamily: FONTS.regular,
      fontSize: 10,
      color: colors.textSubtle,
      marginTop: 2,
    },
    actions: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 12,
    },
    rejectButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 11,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.error,
    },
    rejectButtonText: {
      fontFamily: FONTS.semiBold,
      fontSize: 13,
      color: colors.error,
    },
    approveButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 11,
      borderRadius: 10,
      backgroundColor: colors.teal,
    },
    approveButtonText: {
      fontFamily: FONTS.semiBold,
      fontSize: 13,
      color: colors.white,
    },
    payoutButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginTop: 12,
      paddingVertical: 11,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.teal,
    },
    payoutButtonText: {
      fontFamily: FONTS.semiBold,
      fontSize: 13,
      color: colors.teal,
    },
  });
}
