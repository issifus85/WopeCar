import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Modal, Pressable, ScrollView, ActivityIndicator, Image, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import BadgeStatus from './BadgeStatus';
import ConfirmModal from '../ConfirmModal';
import OptionPickerModal from '../OptionPickerModal';
import { getUserDetail, verifyUser, suspendUser, changeUserRole } from '../../services/adminUsersApi';
import { getUserVerificationDocuments } from '../../services/adminDocumentsApi';

const ROLE_TONE = { admin: 'success', vendor: 'warning', renter: 'neutral', suspended: 'error' };
const ROLE_OPTIONS = ['renter', 'vendor', 'admin'];
const VERIFICATION_DOC_LABELS = [
  { type: 'license_front', label: "License - Front" },
  { type: 'license_back', label: "License - Back" },
  { type: 'proof_of_address', label: 'Proof of Address' },
];

function Field({ label, value, styles }) {
  if (!value) return null;
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

export default function UserDetailModal({ visible, userId, onClose, onChanged }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [detail, setDetail] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingAction, setPendingAction] = useState(null); // 'verify' | 'suspend' | null
  const [isRolePickerVisible, setIsRolePickerVisible] = useState(false);
  const [error, setError] = useState(null);
  const [docs, setDocs] = useState(null);
  const [isLoadingDocs, setIsLoadingDocs] = useState(true);

  useEffect(() => {
    if (!visible || !userId) return;
    setIsLoading(true);
    setError(null);
    getUserDetail(userId)
      .then(setDetail)
      .catch((e) => setError(e.message || 'Could not load user.'))
      .finally(() => setIsLoading(false));

    setIsLoadingDocs(true);
    getUserVerificationDocuments(userId)
      .then(setDocs)
      .catch(() => setDocs({}))
      .finally(() => setIsLoadingDocs(false));
  }, [visible, userId]);

  const runAction = async (action) => {
    setIsSaving(true);
    try {
      const updated = action === 'verify' ? await verifyUser(userId) : await suspendUser(userId);
      setDetail((prev) => ({ ...prev, ...updated }));
      onChanged?.();
    } catch (e) {
      setError(e.message || 'Action failed.');
    } finally {
      setIsSaving(false);
      setPendingAction(null);
    }
  };

  const handleRoleChange = async (role) => {
    setIsSaving(true);
    try {
      const updated = await changeUserRole(userId, role);
      setDetail((prev) => ({ ...prev, ...updated }));
      onChanged?.();
    } catch (e) {
      setError(e.message || 'Could not change role.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>User Details</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {isLoading ? (
            <ActivityIndicator size="large" color={colors.teal} style={styles.loading} />
          ) : !detail ? (
            <Text style={styles.errorText}>{error || 'User not found.'}</Text>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.avatarRow}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{(detail.full_name || detail.email || '?').charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.avatarInfo}>
                  <Text style={styles.name}>{detail.full_name || 'Unnamed User'}</Text>
                  <View style={styles.badgeRow}>
                    <BadgeStatus label={detail.role} tone={ROLE_TONE[detail.role] || 'neutral'} />
                    {detail.is_verified && <BadgeStatus label="Verified" tone="success" />}
                  </View>
                </View>
              </View>

              <Field label="Email" value={detail.email} styles={styles} />
              <Field label="Phone" value={detail.phone} styles={styles} />
              <Field label="Address" value={[detail.address, detail.city, detail.country].filter(Boolean).join(', ')} styles={styles} />
              <Field label="Driver's License" value={detail.driver_license_number} styles={styles} />
              <Field label="License Expiry" value={detail.driver_license_expiry} styles={styles} />
              <Field label="License Country" value={detail.driver_license_country} styles={styles} />
              <Field label="License Verification" value={detail.license_verification_status} styles={styles} />
              <Field label="Joined" value={detail.created_at ? new Date(detail.created_at).toLocaleDateString() : null} styles={styles} />

              <Text style={styles.docsSectionTitle}>Verification Documents</Text>
              {isLoadingDocs ? (
                <ActivityIndicator color={colors.teal} style={{ marginVertical: 8 }} />
              ) : (
                <View style={styles.docRow}>
                  {VERIFICATION_DOC_LABELS.map(({ type, label }) => {
                    const doc = docs?.[type];
                    return (
                      <TouchableOpacity
                        key={type}
                        style={styles.docTile}
                        disabled={!doc}
                        onPress={() => doc && Linking.openURL(doc.signedUrl)}
                      >
                        {doc ? (
                          <Image source={{ uri: doc.signedUrl }} style={styles.docThumbnail} />
                        ) : (
                          <View style={[styles.docThumbnail, styles.docThumbnailEmpty]}>
                            <Ionicons name="document-outline" size={18} color={colors.textSubtle} />
                          </View>
                        )}
                        <Text style={styles.docTileLabel} numberOfLines={1}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {!!error && <Text style={styles.errorText}>{error}</Text>}

              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.actionButton, detail.is_verified && styles.actionButtonDisabled]}
                  disabled={detail.is_verified || isSaving}
                  onPress={() => setPendingAction('verify')}
                >
                  <Ionicons name="checkmark-circle-outline" size={18} color={detail.is_verified ? colors.disabled : colors.teal} />
                  <Text style={[styles.actionButtonText, detail.is_verified && styles.actionButtonTextDisabled]}>
                    {detail.is_verified ? 'Already Verified' : 'Verify User'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.actionButton} disabled={isSaving} onPress={() => setIsRolePickerVisible(true)}>
                  <Ionicons name="swap-horizontal-outline" size={18} color={colors.teal} />
                  <Text style={styles.actionButtonText}>Change Role</Text>
                </TouchableOpacity>

                {detail.role !== 'suspended' && (
                  <TouchableOpacity style={styles.actionButton} disabled={isSaving} onPress={() => setPendingAction('suspend')}>
                    <Ionicons name="ban-outline" size={18} color={colors.error} />
                    <Text style={[styles.actionButtonText, { color: colors.error }]}>Suspend User</Text>
                  </TouchableOpacity>
                )}
              </View>
            </ScrollView>
          )}
        </Pressable>
      </Pressable>

      <ConfirmModal
        visible={pendingAction === 'verify'}
        title="Verify this user?"
        message={`${detail?.full_name || 'This user'} will be marked as verified.`}
        confirmLabel="Verify"
        onConfirm={() => runAction('verify')}
        onCancel={() => setPendingAction(null)}
      />
      <ConfirmModal
        visible={pendingAction === 'suspend'}
        title="Suspend this user?"
        message={`${detail?.full_name || 'This user'} will lose access until reactivated via Change Role.`}
        confirmLabel="Suspend"
        destructive
        onConfirm={() => runAction('suspend')}
        onCancel={() => setPendingAction(null)}
      />
      <OptionPickerModal
        visible={isRolePickerVisible}
        title="Change Role"
        options={ROLE_OPTIONS}
        value={detail?.role}
        onSelect={handleRoleChange}
        onClose={() => setIsRolePickerVisible(false)}
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
      maxHeight: '85%',
      backgroundColor: colors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 20,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
    headerTitle: {
      fontFamily: FONTS.bold,
      fontSize: 18,
      color: colors.textPrimary,
    },
    loading: {
      paddingVertical: 40,
    },
    avatarRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 16,
    },
    avatar: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: colors.highlight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: {
      fontFamily: FONTS.bold,
      fontSize: 20,
      color: colors.teal,
    },
    avatarInfo: {
      flex: 1,
      gap: 6,
    },
    name: {
      fontFamily: FONTS.bold,
      fontSize: 16,
      color: colors.textPrimary,
    },
    badgeRow: {
      flexDirection: 'row',
      gap: 6,
    },
    field: {
      marginBottom: 12,
    },
    docsSectionTitle: {
      fontFamily: FONTS.semiBold,
      fontSize: 13,
      color: colors.textPrimary,
      marginTop: 4,
      marginBottom: 10,
    },
    docRow: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 12,
    },
    docTile: {
      flex: 1,
      alignItems: 'center',
      gap: 6,
    },
    docThumbnail: {
      width: '100%',
      aspectRatio: 1.4,
      borderRadius: 10,
      backgroundColor: colors.background,
    },
    docThumbnailEmpty: {
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      borderStyle: 'dashed',
    },
    docTileLabel: {
      fontFamily: FONTS.medium,
      fontSize: 10,
      color: colors.textSubtle,
      textAlign: 'center',
    },
    fieldLabel: {
      fontFamily: FONTS.regular,
      fontSize: 11,
      color: colors.textSubtle,
      marginBottom: 2,
    },
    fieldValue: {
      fontFamily: FONTS.medium,
      fontSize: 14,
      color: colors.textPrimary,
    },
    errorText: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.error,
      textAlign: 'center',
      marginVertical: 12,
    },
    actions: {
      marginTop: 8,
      marginBottom: 20,
      gap: 10,
    },
    actionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 13,
      paddingHorizontal: 14,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    actionButtonDisabled: {
      opacity: 0.5,
    },
    actionButtonText: {
      fontFamily: FONTS.semiBold,
      fontSize: 14,
      color: colors.textPrimary,
    },
    actionButtonTextDisabled: {
      color: colors.disabled,
    },
  });
}
