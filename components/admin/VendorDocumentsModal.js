import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Modal, Pressable, ScrollView, ActivityIndicator, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import BadgeStatus from './BadgeStatus';
import ReasonModal from './ReasonModal';
import ConfirmModal from '../ConfirmModal';
import { getVendorDocuments, setVendorDocumentStatus } from '../../services/adminVendorsApi';

const STATUS_TONE = { not_submitted: 'muted', under_review: 'warning', verified: 'success', rejected: 'error' };
const STATUS_LABEL = { not_submitted: 'Not Submitted', under_review: 'Under Review', verified: 'Verified', rejected: 'Rejected' };

function DocGroup({ title, status, rejectionReason, images, onVerify, onReject, isSaving, styles, colors }) {
  return (
    <View style={styles.group}>
      <View style={styles.groupHeader}>
        <Text style={styles.groupTitle}>{title}</Text>
        <BadgeStatus label={STATUS_LABEL[status] ?? 'Not Submitted'} tone={STATUS_TONE[status] ?? 'muted'} />
      </View>

      {images.some(Boolean) ? (
        <View style={styles.imageRow}>
          {images.filter(Boolean).map((uri) => (
            <Image key={uri} source={{ uri }} style={styles.image} resizeMode="cover" />
          ))}
        </View>
      ) : (
        <Text style={styles.emptyText}>Nothing uploaded yet.</Text>
      )}

      {status === 'rejected' && !!rejectionReason && (
        <Text style={styles.rejectionReason}>Reason: {rejectionReason}</Text>
      )}

      {images.some(Boolean) && status !== 'verified' && (
        <View style={styles.groupActions}>
          <TouchableOpacity style={styles.rejectButton} disabled={isSaving} onPress={onReject}>
            <Ionicons name="close-circle-outline" size={16} color={colors.error} />
            <Text style={styles.rejectButtonText}>Reject</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.verifyButton} disabled={isSaving} onPress={onVerify}>
            <Ionicons name="checkmark-circle-outline" size={16} color={colors.white} />
            <Text style={styles.verifyButtonText}>Verify</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

export default function VendorDocumentsModal({ visible, vendor, onClose, onChanged }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [docs, setDocs] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [pendingVerify, setPendingVerify] = useState(null); // 'id' | 'business_reg' | null
  const [pendingReject, setPendingReject] = useState(null); // 'id' | 'business_reg' | null

  useEffect(() => {
    if (!visible || !vendor?.user_id) return;
    setIsLoading(true);
    setError(null);
    getVendorDocuments(vendor.user_id)
      .then(setDocs)
      .catch((e) => setError(e.message || 'Could not load documents.'))
      .finally(() => setIsLoading(false));
  }, [visible, vendor?.user_id]);

  const runStatusChange = async (docKey, status, reason) => {
    setIsSaving(true);
    setError(null);
    try {
      await setVendorDocumentStatus(vendor, docKey, status, reason);
      onChanged?.();
      onClose();
    } catch (e) {
      setError(e.message || 'Could not update this document.');
    } finally {
      setIsSaving(false);
      setPendingVerify(null);
      setPendingReject(null);
    }
  };

  if (!vendor) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Verification Documents</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
          <Text style={styles.headerSubtitle}>{vendor.business_name || 'This vendor'}</Text>

          {isLoading ? (
            <ActivityIndicator size="large" color={colors.teal} style={styles.loading} />
          ) : (
            <ScrollView showsVerticalScrollIndicator={false}>
              {!!error && <Text style={styles.errorText}>{error}</Text>}

              <DocGroup
                title="Identity — Ghana Card"
                status={vendor.id_document_status}
                rejectionReason={vendor.id_document_rejection_reason}
                images={[docs.vendor_id_front, docs.vendor_id_back]}
                isSaving={isSaving}
                onVerify={() => setPendingVerify('id')}
                onReject={() => setPendingReject('id')}
                styles={styles}
                colors={colors}
              />
              <DocGroup
                title="Business Registration"
                status={vendor.business_reg_document_status}
                rejectionReason={vendor.business_reg_document_rejection_reason}
                images={[docs.vendor_business_reg]}
                isSaving={isSaving}
                onVerify={() => setPendingVerify('business_reg')}
                onReject={() => setPendingReject('business_reg')}
                styles={styles}
                colors={colors}
              />
            </ScrollView>
          )}
        </Pressable>
      </Pressable>

      <ConfirmModal
        visible={!!pendingVerify}
        title="Verify this document?"
        message="The vendor will be notified that it's been verified."
        confirmLabel="Verify"
        onConfirm={() => runStatusChange(pendingVerify, 'verified')}
        onCancel={() => setPendingVerify(null)}
      />
      <ReasonModal
        visible={!!pendingReject}
        title="Reject this document"
        placeholder="What's wrong with it..."
        submitLabel="Reject"
        onCancel={() => setPendingReject(null)}
        onSubmit={(reason) => runStatusChange(pendingReject, 'rejected', reason)}
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
      maxHeight: '88%',
      backgroundColor: colors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 20,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    headerTitle: {
      fontFamily: FONTS.bold,
      fontSize: 18,
      color: colors.textPrimary,
    },
    headerSubtitle: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textSubtle,
      marginTop: 2,
      marginBottom: 16,
    },
    loading: {
      paddingVertical: 40,
    },
    errorText: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.error,
      textAlign: 'center',
      marginBottom: 12,
    },
    group: {
      marginBottom: 20,
    },
    groupHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    groupTitle: {
      fontFamily: FONTS.semiBold,
      fontSize: 14,
      color: colors.textPrimary,
    },
    imageRow: {
      flexDirection: 'row',
      gap: 10,
    },
    image: {
      flex: 1,
      height: 140,
      borderRadius: 10,
      backgroundColor: colors.background,
    },
    emptyText: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textSubtle,
    },
    rejectionReason: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.error,
      marginTop: 8,
      lineHeight: 17,
    },
    groupActions: {
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
    verifyButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 11,
      borderRadius: 10,
      backgroundColor: colors.teal,
    },
    verifyButtonText: {
      fontFamily: FONTS.semiBold,
      fontSize: 13,
      color: colors.white,
    },
  });
}
