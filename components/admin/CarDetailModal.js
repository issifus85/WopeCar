import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Modal, Pressable, ScrollView, ActivityIndicator, Image, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import { formatCurrency } from '../../constants/pricing';
import ImageGallery from '../ImageGallery';
import BadgeStatus from './BadgeStatus';
import ConfirmModal from '../ConfirmModal';
import ReasonModal from './ReasonModal';
import { approveCar, rejectCar, deactivateCar, reactivateCar } from '../../services/adminCarsApi';
import { getCarDocuments } from '../../services/documentsApi';

const STATUS_TONE = { pending: 'warning', active: 'success', inactive: 'muted' };

function Spec({ label, value, styles }) {
  if (!value) return null;
  return (
    <View style={styles.specItem}>
      <Text style={styles.specLabel}>{label}</Text>
      <Text style={styles.specValue}>{value}</Text>
    </View>
  );
}

export default function CarDetailModal({ visible, car, onClose, onChanged }) {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingAction, setPendingAction] = useState(null); // 'approve' | 'deactivate' | 'reactivate' | null
  const [isRejectVisible, setIsRejectVisible] = useState(false);
  const [error, setError] = useState(null);
  const [complianceDocs, setComplianceDocs] = useState({ roadworthy: null, insurance: null });
  const [docsLoading, setDocsLoading] = useState(true);

  useEffect(() => {
    if (!visible || !car?.id) return;
    setDocsLoading(true);
    getCarDocuments(car.id)
      .then(setComplianceDocs)
      .catch(() => setComplianceDocs({ roadworthy: null, insurance: null }))
      .finally(() => setDocsLoading(false));
  }, [visible, car?.id]);

  if (!car) return null;
  const vendor = car.vendors;
  const owner = vendor?.users;

  const runAction = async (fn) => {
    setIsSaving(true);
    setError(null);
    try {
      await fn(car);
      onChanged?.();
      onClose();
    } catch (e) {
      setError(e.message || 'Action failed.');
    } finally {
      setIsSaving(false);
      setPendingAction(null);
    }
  };

  const handleReject = (reason) => {
    setIsRejectVisible(false);
    runAction((c) => rejectCar(c, reason));
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Car Details</Text>
            <View style={styles.headerActions}>
              <TouchableOpacity
                onPress={() => { onClose(); router.push(`/admin/car/edit/${car.id}`); }}
                hitSlop={10}
              >
                <Ionicons name="create-outline" size={22} color={colors.teal} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { onClose(); router.push(`/admin/car/pricing/${car.id}`); }}
                hitSlop={10}
              >
                <Ionicons name="pricetag-outline" size={22} color={colors.teal} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { onClose(); router.push(`/admin/car/availability/${car.id}`); }}
                hitSlop={10}
              >
                <Ionicons name="calendar-outline" size={22} color={colors.teal} />
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose} hitSlop={10}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <ImageGallery images={car.images ?? []} height={200} borderRadius={12} />

            <View style={styles.titleRow}>
              <Text style={styles.name}>{car.name}</Text>
              <BadgeStatus label={car.status} tone={STATUS_TONE[car.status] || 'muted'} />
            </View>
            <Text style={styles.price}>{formatCurrency(car.price_per_day)} / day</Text>

            <View style={styles.specsGrid}>
              <Spec label="Make" value={car.make} styles={styles} />
              <Spec label="Model" value={car.model} styles={styles} />
              <Spec label="Year" value={car.year} styles={styles} />
              <Spec label="Seats" value={car.seats} styles={styles} />
              <Spec label="Transmission" value={car.transmission} styles={styles} />
              <Spec label="Drive Type" value={car.drive_type} styles={styles} />
              <Spec label="Region" value={car.regions?.name} styles={styles} />
              <Spec label="Location" value={car.location} styles={styles} />
            </View>

            <Text style={styles.sectionLabel}>Vendor</Text>
            <View style={styles.vendorCard}>
              <Text style={styles.vendorName}>{vendor?.business_name || 'Unknown vendor'}</Text>
              <Text style={styles.vendorDetail}>{owner?.full_name}</Text>
              <Text style={styles.vendorDetail}>{owner?.email}</Text>
              <Text style={styles.vendorDetail}>{owner?.phone}</Text>
            </View>

            {!!car.description && (
              <>
                <Text style={styles.sectionLabel}>Description</Text>
                <Text style={styles.description}>{car.description}</Text>
              </>
            )}

            {!!car.features?.length && (
              <>
                <Text style={styles.sectionLabel}>Features</Text>
                <View style={styles.featuresRow}>
                  {car.features.map((f) => (
                    <View key={f} style={styles.featureChip}>
                      <Text style={styles.featureChipText}>{f}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            <Text style={styles.sectionLabel}>Compliance Documents</Text>
            <View style={styles.vendorCard}>
              <View style={styles.complianceRow}>
                <Text style={styles.vendorDetail}>Insurance Policy #</Text>
                <Text style={styles.vendorName}>{car.insurance_policy_number || 'Not provided'}</Text>
              </View>
              {docsLoading ? (
                <ActivityIndicator color={colors.teal} style={styles.docsLoading} />
              ) : (
                <View style={styles.docThumbRow}>
                  <TouchableOpacity
                    style={styles.docThumbWrap}
                    disabled={!complianceDocs.roadworthy}
                    onPress={() => Linking.openURL(complianceDocs.roadworthy)}
                  >
                    {complianceDocs.roadworthy ? (
                      <Image source={{ uri: complianceDocs.roadworthy }} style={styles.docThumb} resizeMode="cover" />
                    ) : (
                      <View style={[styles.docThumb, styles.docThumbEmpty]}>
                        <Ionicons name="document-outline" size={20} color={colors.textSubtle} />
                      </View>
                    )}
                    <Text style={styles.docThumbLabel}>Roadworthy Cert.</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.docThumbWrap}
                    disabled={!complianceDocs.insurance}
                    onPress={() => Linking.openURL(complianceDocs.insurance)}
                  >
                    {complianceDocs.insurance ? (
                      <Image source={{ uri: complianceDocs.insurance }} style={styles.docThumb} resizeMode="cover" />
                    ) : (
                      <View style={[styles.docThumb, styles.docThumbEmpty]}>
                        <Ionicons name="document-outline" size={20} color={colors.textSubtle} />
                      </View>
                    )}
                    <Text style={styles.docThumbLabel}>Insurance Doc</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {!!error && <Text style={styles.errorText}>{error}</Text>}

            <View style={styles.actions}>
              {car.status === 'pending' && (
                <>
                  <TouchableOpacity style={styles.rejectButton} disabled={isSaving} onPress={() => setIsRejectVisible(true)}>
                    <Ionicons name="close-circle-outline" size={16} color={colors.error} />
                    <Text style={styles.rejectButtonText}>Reject</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.primaryButton} disabled={isSaving} onPress={() => setPendingAction('approve')}>
                    <Ionicons name="checkmark-circle-outline" size={16} color={colors.white} />
                    <Text style={styles.primaryButtonText}>Approve</Text>
                  </TouchableOpacity>
                </>
              )}
              {car.status === 'active' && (
                <TouchableOpacity style={styles.rejectButton} disabled={isSaving} onPress={() => setPendingAction('deactivate')}>
                  <Ionicons name="pause-circle-outline" size={16} color={colors.error} />
                  <Text style={styles.rejectButtonText}>Deactivate Listing</Text>
                </TouchableOpacity>
              )}
              {car.status === 'inactive' && (
                <TouchableOpacity style={styles.primaryButton} disabled={isSaving} onPress={() => setPendingAction('reactivate')}>
                  <Ionicons name="play-circle-outline" size={16} color={colors.white} />
                  <Text style={styles.primaryButtonText}>Reactivate Listing</Text>
                </TouchableOpacity>
              )}
              {isSaving && <ActivityIndicator color={colors.teal} />}
            </View>
          </ScrollView>
        </View>
      </View>

      <ConfirmModal
        visible={pendingAction === 'approve'}
        title="Approve this listing?"
        message={`${car.name} will go live and the vendor will be notified.`}
        confirmLabel="Approve"
        onConfirm={() => runAction(approveCar)}
        onCancel={() => setPendingAction(null)}
      />
      <ConfirmModal
        visible={pendingAction === 'deactivate'}
        title="Deactivate this listing?"
        message={`${car.name} will be hidden from renters and the vendor will be notified.`}
        confirmLabel="Deactivate"
        destructive
        onConfirm={() => runAction(deactivateCar)}
        onCancel={() => setPendingAction(null)}
      />
      <ConfirmModal
        visible={pendingAction === 'reactivate'}
        title="Reactivate this listing?"
        message={`${car.name} will be visible to renters again.`}
        confirmLabel="Reactivate"
        onConfirm={() => runAction(reactivateCar)}
        onCancel={() => setPendingAction(null)}
      />
      <ReasonModal
        visible={isRejectVisible}
        title="Reject Listing"
        placeholder="Reason for rejection..."
        submitLabel="Send & Reject"
        onCancel={() => setIsRejectVisible(false)}
        onSubmit={handleReject}
      />
    </Modal>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    sheet: {
      maxHeight: '90%',
      backgroundColor: colors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 20,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    headerTitle: {
      fontFamily: FONTS.bold,
      fontSize: 18,
      color: colors.textPrimary,
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 18,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 14,
    },
    name: {
      fontFamily: FONTS.bold,
      fontSize: 17,
      color: colors.textPrimary,
      flex: 1,
    },
    price: {
      fontFamily: FONTS.semiBold,
      fontSize: 14,
      color: colors.textPrimary,
      marginTop: 4,
    },
    specsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      marginTop: 16,
    },
    specItem: {
      flexBasis: '30%',
    },
    specLabel: {
      fontFamily: FONTS.regular,
      fontSize: 10,
      color: colors.textSubtle,
    },
    specValue: {
      fontFamily: FONTS.medium,
      fontSize: 13,
      color: colors.textPrimary,
      marginTop: 1,
    },
    sectionLabel: {
      fontFamily: FONTS.bold,
      fontSize: 13,
      color: colors.textPrimary,
      marginTop: 20,
      marginBottom: 8,
    },
    vendorCard: {
      backgroundColor: colors.background,
      borderRadius: 10,
      padding: 12,
      gap: 2,
    },
    vendorName: {
      fontFamily: FONTS.semiBold,
      fontSize: 13,
      color: colors.textPrimary,
    },
    vendorDetail: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textSubtle,
    },
    complianceRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 10,
    },
    docsLoading: {
      marginTop: 8,
    },
    docThumbRow: {
      flexDirection: 'row',
      gap: 10,
    },
    docThumbWrap: {
      flex: 1,
      alignItems: 'center',
      gap: 4,
    },
    docThumb: {
      width: '100%',
      height: 80,
      borderRadius: 8,
      backgroundColor: colors.surface,
    },
    docThumbEmpty: {
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      borderStyle: 'dashed',
    },
    docThumbLabel: {
      fontFamily: FONTS.regular,
      fontSize: 10,
      color: colors.textSubtle,
    },
    description: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textBody,
      lineHeight: 19,
    },
    errorText: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.error,
      marginTop: 12,
      textAlign: 'center',
    },
    featuresRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    featureChip: {
      backgroundColor: colors.highlight,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 8,
    },
    featureChipText: {
      fontFamily: FONTS.medium,
      fontSize: 11,
      color: colors.textMuted,
    },
    actions: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 24,
      marginBottom: 12,
      alignItems: 'center',
    },
    rejectButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.error,
    },
    rejectButtonText: {
      fontFamily: FONTS.semiBold,
      fontSize: 13,
      color: colors.error,
    },
    primaryButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 12,
      borderRadius: 10,
      backgroundColor: colors.teal,
    },
    primaryButtonText: {
      fontFamily: FONTS.semiBold,
      fontSize: 13,
      color: colors.white,
    },
  });
}
