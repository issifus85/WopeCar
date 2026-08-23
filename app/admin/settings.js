import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, Switch, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import SectionHeading from '../../components/SectionHeading';
import BadgeStatus from '../../components/admin/BadgeStatus';
import ConfirmModal from '../../components/ConfirmModal';
import FilterTabs from '../../components/admin/FilterTabs';
import DateRangeModal, { formatDateShort } from '../../components/DateRangeModal';
import {
  listAppSettings, updateAppSetting,
  listRegions, setRegionActive, addRegion,
  listPromoCodes, createPromoCode, setPromoActive, deletePromoCode,
  broadcastNotification,
} from '../../services/adminSettingsApi';

// Admin-only, site-wide promotional discount - see constants/pricing.js's
// calculateRentalPricing/isAnyDiscountActive/applyAnyDiscount for how this
// interacts with a car's own discount (the car's own always wins; this only
// fills in for cars that don't have one of their own active). Stored as 5
// flat app_settings rows rather than one jsonb object, same shape as every
// other setting on this screen.
const APP_WIDE_DISCOUNT_KEYS = {
  enabled: 'app_wide_discount_enabled',
  type: 'app_wide_discount_type',
  value: 'app_wide_discount_value',
  startsAt: 'app_wide_discount_starts_at',
  endsAt: 'app_wide_discount_ends_at',
};

const BUSINESS_KEYS = [
  { key: 'self_drive_delivery_fee', label: 'Self-Drive Delivery Fee (GHS)' },
  { key: 'security_deposit_flat', label: 'Security Deposit — Flat (GHS)' },
  { key: 'security_deposit_threshold', label: 'Security Deposit Threshold (GHS)' },
  { key: 'security_deposit_percentage', label: 'Security Deposit — Percentage (0–1)' },
  { key: 'chauffeur_security_deposit', label: 'Chauffeur Security Deposit — Flat (GHS)' },
  { key: 'min_booking_days_self_drive', label: 'Min Booking Days — Self-Drive' },
  { key: 'min_booking_days_chauffeur', label: 'Min Booking Days — Chauffeur' },
  { key: 'booking_window_months', label: 'Booking Window (months)' },
  { key: 'latest_badge_days', label: 'Latest Badge Window (days)' },
];

// Enforced for real by the cancel-booking Edge Function (used by this
// screen's own booking cancel action, the renter's own cancel flow, and the
// web admin dashboard) - editing these actually changes refund amounts, not
// just stored config. See services/adminBookingsApi.js's cancelBooking.
const CANCELLATION_KEYS = [
  { key: 'cancellation_full_refund_hours', label: 'Full Refund Window (hrs before pickup)' },
  { key: 'cancellation_partial_refund_hours', label: 'Partial Refund Window (hrs before pickup)' },
  { key: 'cancellation_partial_refund_percentage', label: 'Partial Refund — Percentage (0–1)' },
];

// Feeds constants/currencies.js's CURRENCY_META (via services/currencyApi.js)
// everywhere formatCurrency() converts a GHS price for display - real and
// live, not just stored. GHS itself has no rate row here since it's the
// base currency everything is stored in; its rate is always exactly 1.
const CURRENCY_KEYS = [
  { key: 'currency_rate_usd', label: 'USD Exchange Rate (GHS per $1)' },
  { key: 'currency_rate_eur', label: 'EUR Exchange Rate (GHS per €1)' },
];

const CONTACT_KEYS = [
  { key: 'support_phone_1', label: 'Primary Support Phone' },
  { key: 'support_phone_2', label: 'Secondary Support Phone' },
  { key: 'support_email', label: 'Support Email' },
  { key: 'support_address', label: 'Office Address' },
  { key: 'operations_lead_email', label: 'Operations Lead Email (Calendar Invites)' },
  { key: 'operations_support_email', label: 'Operations Support Email (Calendar CC, optional)' },
  { key: 'fleet_ops_email', label: 'Fleet Ops Email (Inspection Report Bcc)' },
];

const BROADCAST_TARGETS = [
  { key: 'all', label: 'All Users' },
  { key: 'renters', label: 'Renters' },
  { key: 'vendors', label: 'Vendors' },
  { key: 'admins', label: 'Admins' },
];

function SettingRow({ label, value, onEdit, styles, colors }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowTextWrap}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue}>{String(value)}</Text>
      </View>
      <TouchableOpacity onPress={onEdit} hitSlop={10}>
        <Ionicons name="create-outline" size={18} color={colors.teal} />
      </TouchableOpacity>
    </View>
  );
}

export default function AdminSettingsScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [settings, setSettings] = useState([]);
  const [regions, setRegions] = useState([]);
  const [promoCodes, setPromoCodes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const [editingKey, setEditingKey] = useState(null);
  const [editValue, setEditValue] = useState('');

  const [newRegionName, setNewRegionName] = useState('');
  const [isAddingRegion, setIsAddingRegion] = useState(false);

  const [isPromoFormVisible, setIsPromoFormVisible] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [promoType, setPromoType] = useState('percentage');
  const [promoValue, setPromoValue] = useState('');
  const [promoMaxUses, setPromoMaxUses] = useState('');
  const [deletingPromoId, setDeletingPromoId] = useState(null);

  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastBody, setBroadcastBody] = useState('');
  const [broadcastTarget, setBroadcastTarget] = useState('all');
  const [isBroadcastConfirmVisible, setIsBroadcastConfirmVisible] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState(null);

  const [appWideDiscount, setAppWideDiscount] = useState({ enabled: false, type: 'percentage', value: '', startsAt: null, endsAt: null });
  const [isDiscountDateModalVisible, setIsDiscountDateModalVisible] = useState(false);
  const [isSavingDiscount, setIsSavingDiscount] = useState(false);
  const [hasLoadedDiscount, setHasLoadedDiscount] = useState(false);

  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [s, r, p] = await Promise.all([listAppSettings(), listRegions(), listPromoCodes()]);
      setSettings(s);
      setRegions(r);
      setPromoCodes(p);
    } catch (e) {
      setError(e.message || 'Could not load settings.');
    }
  }, []);

  useEffect(() => {
    setIsLoading(true);
    load().finally(() => setIsLoading(false));
  }, [load]);

  const settingsByKey = useMemo(() => {
    const map = {};
    settings.forEach((s) => { map[s.key] = s.value; });
    return map;
  }, [settings]);

  // One-time seed from whatever's saved - after this, local edits are the
  // source of truth until "Save Discount Settings" is pressed, so a
  // background settings refetch (e.g. after editing an unrelated key)
  // doesn't clobber an in-progress edit here.
  useEffect(() => {
    if (hasLoadedDiscount || settings.length === 0) return;
    setHasLoadedDiscount(true);
    setAppWideDiscount({
      enabled: !!settingsByKey[APP_WIDE_DISCOUNT_KEYS.enabled],
      type: settingsByKey[APP_WIDE_DISCOUNT_KEYS.type] === 'flat' ? 'flat' : 'percentage',
      value: settingsByKey[APP_WIDE_DISCOUNT_KEYS.value] != null ? String(settingsByKey[APP_WIDE_DISCOUNT_KEYS.value]) : '',
      startsAt: settingsByKey[APP_WIDE_DISCOUNT_KEYS.startsAt] ?? null,
      endsAt: settingsByKey[APP_WIDE_DISCOUNT_KEYS.endsAt] ?? null,
    });
  }, [settings, settingsByKey, hasLoadedDiscount]);

  const patchAppWideDiscount = (patch) => setAppWideDiscount((prev) => ({ ...prev, ...patch }));

  const saveAppWideDiscount = async () => {
    setIsSavingDiscount(true);
    try {
      await Promise.all([
        updateAppSetting(APP_WIDE_DISCOUNT_KEYS.enabled, appWideDiscount.enabled),
        updateAppSetting(APP_WIDE_DISCOUNT_KEYS.type, appWideDiscount.type),
        updateAppSetting(APP_WIDE_DISCOUNT_KEYS.value, appWideDiscount.value ? Number(appWideDiscount.value) : null),
        updateAppSetting(APP_WIDE_DISCOUNT_KEYS.startsAt, appWideDiscount.startsAt),
        updateAppSetting(APP_WIDE_DISCOUNT_KEYS.endsAt, appWideDiscount.endsAt),
      ]);
      await load();
    } catch (e) {
      setError(e.message || 'Could not save the app-wide discount.');
    } finally {
      setIsSavingDiscount(false);
    }
  };

  const startEdit = (key) => {
    setEditingKey(key);
    setEditValue(String(settingsByKey[key] ?? ''));
  };

  const saveEdit = async () => {
    const isNumeric = [...BUSINESS_KEYS, ...CANCELLATION_KEYS, ...CURRENCY_KEYS].some((k) => k.key === editingKey);
    const value = isNumeric ? Number(editValue) : editValue;
    setIsSaving(true);
    try {
      await updateAppSetting(editingKey, value);
      await load();
      setEditingKey(null);
    } catch (e) {
      setError(e.message || 'Could not save setting.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleRegion = async (region) => {
    setRegions((prev) => prev.map((r) => (r.id === region.id ? { ...r, is_active: !r.is_active } : r)));
    try {
      await setRegionActive(region.id, !region.is_active);
    } catch (e) {
      setError(e.message || 'Could not update region.');
      load();
    }
  };

  const handleAddRegion = async () => {
    if (!newRegionName.trim()) return;
    setIsSaving(true);
    try {
      await addRegion(newRegionName.trim());
      setNewRegionName('');
      setIsAddingRegion(false);
      await load();
    } catch (e) {
      setError(e.message || 'Could not add region.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTogglePromo = async (promo) => {
    setPromoCodes((prev) => prev.map((p) => (p.id === promo.id ? { ...p, is_active: !p.is_active } : p)));
    try {
      await setPromoActive(promo.id, !promo.is_active);
    } catch (e) {
      setError(e.message || 'Could not update promo code.');
      load();
    }
  };

  const handleCreatePromo = async () => {
    if (!promoCode.trim() || !promoValue) return;
    setIsSaving(true);
    try {
      await createPromoCode({
        code: promoCode,
        discountType: promoType,
        discountValue: Number(promoValue),
        maxUses: promoMaxUses ? Number(promoMaxUses) : null,
      });
      setPromoCode('');
      setPromoValue('');
      setPromoMaxUses('');
      setIsPromoFormVisible(false);
      await load();
    } catch (e) {
      setError(e.message || 'Could not create promo code.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeletePromo = async () => {
    const id = deletingPromoId;
    setDeletingPromoId(null);
    try {
      await deletePromoCode(id);
      await load();
    } catch (e) {
      setError(e.message || 'Could not delete promo code.');
    }
  };

  const handleSendBroadcast = async () => {
    setIsBroadcastConfirmVisible(false);
    setIsSaving(true);
    try {
      const count = await broadcastNotification({
        title: broadcastTitle.trim(),
        body: broadcastBody.trim(),
        target: broadcastTarget,
      });
      setBroadcastResult(`Sent to ${count} user${count === 1 ? '' : 's'}.`);
      setBroadcastTitle('');
      setBroadcastBody('');
    } catch (e) {
      setError(e.message || 'Could not send broadcast.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={colors.teal} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {!!error && <Text style={styles.errorText}>{error}</Text>}

        <View style={styles.section}>
          <SectionHeading>Business Rules</SectionHeading>
          {BUSINESS_KEYS.map((meta) => (
            <SettingRow
              key={meta.key}
              label={meta.label}
              value={settingsByKey[meta.key] ?? '—'}
              onEdit={() => startEdit(meta.key)}
              styles={styles}
              colors={colors}
            />
          ))}
        </View>

        <View style={styles.section}>
          <SectionHeading>Contact Info</SectionHeading>
          {CONTACT_KEYS.map((meta) => (
            <SettingRow
              key={meta.key}
              label={meta.label}
              value={settingsByKey[meta.key] ?? '—'}
              onEdit={() => startEdit(meta.key)}
              styles={styles}
              colors={colors}
            />
          ))}
        </View>

        <View style={styles.section}>
          <SectionHeading>Cancellation Policy</SectionHeading>
          {CANCELLATION_KEYS.map((meta) => (
            <SettingRow
              key={meta.key}
              label={meta.label}
              value={settingsByKey[meta.key] ?? '—'}
              onEdit={() => startEdit(meta.key)}
              styles={styles}
              colors={colors}
            />
          ))}
        </View>

        <View style={styles.section}>
          <SectionHeading>Currency Rates</SectionHeading>
          <View style={styles.row}>
            <View style={styles.rowTextWrap}>
              <Text style={styles.rowLabel}>Ghana Cedis (GHS)</Text>
              <Text style={styles.rowValue}>Base currency — always 1, not editable</Text>
            </View>
          </View>
          {CURRENCY_KEYS.map((meta) => (
            <SettingRow
              key={meta.key}
              label={meta.label}
              value={settingsByKey[meta.key] ?? '—'}
              onEdit={() => startEdit(meta.key)}
              styles={styles}
              colors={colors}
            />
          ))}
        </View>

        <View style={styles.section}>
          <SectionHeading>Regions</SectionHeading>
          {regions.map((region) => (
            <View key={region.id} style={styles.row}>
              <Text style={styles.rowLabel}>{region.name}</Text>
              <Switch
                value={region.is_active}
                onValueChange={() => handleToggleRegion(region)}
                trackColor={{ false: colors.disabled, true: colors.teal }}
                thumbColor={colors.white}
              />
            </View>
          ))}
          {isAddingRegion ? (
            <View style={styles.inlineForm}>
              <TextInput
                style={styles.input}
                value={newRegionName}
                onChangeText={setNewRegionName}
                placeholder="Region name"
                placeholderTextColor={colors.textSubtle}
              />
              <View style={styles.inlineFormActions}>
                <TouchableOpacity style={styles.secondaryButton} onPress={() => setIsAddingRegion(false)}>
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.primaryButton} disabled={isSaving} onPress={handleAddRegion}>
                  <Text style={styles.primaryButtonText}>Add Region</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={styles.addLink} onPress={() => setIsAddingRegion(true)}>
              <Ionicons name="add-circle-outline" size={16} color={colors.teal} />
              <Text style={styles.addLinkText}>Add Region</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.section}>
          <SectionHeading>App-Wide Discount</SectionHeading>
          <View style={styles.row}>
            <View style={styles.rowTextWrap}>
              <Text style={styles.rowLabel}>Site-wide promotional discount</Text>
              <Text style={styles.rowValue}>Shown as strikethrough pricing on any car that doesn't already have its own discount</Text>
            </View>
            <Switch
              value={appWideDiscount.enabled}
              onValueChange={(value) => patchAppWideDiscount({ enabled: value })}
              trackColor={{ false: colors.disabled, true: colors.teal }}
              thumbColor={colors.white}
            />
          </View>

          {appWideDiscount.enabled && (
            <View style={styles.inlineForm}>
              <FilterTabs
                tabs={[{ key: 'percentage', label: 'Percentage' }, { key: 'flat', label: 'Flat (GHS)' }]}
                activeKey={appWideDiscount.type}
                onChange={(type) => patchAppWideDiscount({ type })}
              />
              <TextInput
                style={styles.input}
                value={appWideDiscount.value}
                onChangeText={(value) => patchAppWideDiscount({ value })}
                placeholder={appWideDiscount.type === 'percentage' ? 'Discount %  (e.g. 10)' : 'Discount amount (GHS)'}
                placeholderTextColor={colors.textSubtle}
                keyboardType="numeric"
              />
              <TouchableOpacity style={styles.dateButton} onPress={() => setIsDiscountDateModalVisible(true)}>
                <Ionicons name="calendar-outline" size={16} color={colors.teal} />
                <Text style={styles.dateButtonText}>
                  {appWideDiscount.startsAt && appWideDiscount.endsAt
                    ? `${formatDateShort(new Date(appWideDiscount.startsAt))} — ${formatDateShort(new Date(appWideDiscount.endsAt))}`
                    : 'No date limit (runs indefinitely while on)'}
                </Text>
                {!!(appWideDiscount.startsAt || appWideDiscount.endsAt) && (
                  <TouchableOpacity onPress={() => patchAppWideDiscount({ startsAt: null, endsAt: null })} hitSlop={10}>
                    <Ionicons name="close-circle" size={16} color={colors.textSubtle} />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity
            style={[styles.primaryButton, isSavingDiscount && styles.primaryButtonDisabled]}
            disabled={isSavingDiscount}
            onPress={saveAppWideDiscount}
          >
            <Text style={styles.primaryButtonText}>{isSavingDiscount ? 'Saving...' : 'Save Discount Settings'}</Text>
          </TouchableOpacity>

          <DateRangeModal
            visible={isDiscountDateModalVisible}
            onClose={() => setIsDiscountDateModalVisible(false)}
            startDate={appWideDiscount.startsAt ? new Date(appWideDiscount.startsAt) : null}
            endDate={appWideDiscount.endsAt ? new Date(appWideDiscount.endsAt) : null}
            onApply={(start, end) => {
              const toISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
              patchAppWideDiscount({ startsAt: start ? toISO(start) : null, endsAt: end ? toISO(end) : null });
            }}
          />
        </View>

        <View style={styles.section}>
          <SectionHeading>Promo Codes</SectionHeading>
          {promoCodes.length === 0 && !isPromoFormVisible && (
            <Text style={styles.emptyText}>No promo codes yet.</Text>
          )}
          {promoCodes.map((promo) => (
            <View key={promo.id} style={styles.promoRow}>
              <View style={styles.rowTextWrap}>
                <View style={styles.promoCodeLine}>
                  <Text style={styles.promoCode}>{promo.code}</Text>
                  <BadgeStatus label={promo.is_active ? 'Active' : 'Inactive'} tone={promo.is_active ? 'success' : 'muted'} />
                </View>
                <Text style={styles.rowValue}>
                  {promo.discount_type === 'percentage' ? `${promo.discount_value}% off` : `GHS ${promo.discount_value} off`}
                  {'  ·  '}{promo.uses_count}{promo.max_uses ? `/${promo.max_uses}` : ''} used
                </Text>
              </View>
              <View style={styles.promoActions}>
                <Switch
                  value={promo.is_active}
                  onValueChange={() => handleTogglePromo(promo)}
                  trackColor={{ false: colors.disabled, true: colors.teal }}
                  thumbColor={colors.white}
                />
                <TouchableOpacity onPress={() => setDeletingPromoId(promo.id)} hitSlop={10}>
                  <Ionicons name="trash-outline" size={18} color={colors.error} />
                </TouchableOpacity>
              </View>
            </View>
          ))}

          {isPromoFormVisible ? (
            <View style={styles.inlineForm}>
              <TextInput
                style={styles.input}
                value={promoCode}
                onChangeText={setPromoCode}
                placeholder="Promo code (e.g. WELCOME10)"
                placeholderTextColor={colors.textSubtle}
                autoCapitalize="characters"
              />
              <FilterTabs
                tabs={[{ key: 'percentage', label: 'Percentage' }, { key: 'flat', label: 'Flat (GHS)' }]}
                activeKey={promoType}
                onChange={setPromoType}
              />
              <TextInput
                style={styles.input}
                value={promoValue}
                onChangeText={setPromoValue}
                placeholder={promoType === 'percentage' ? 'Discount %  (e.g. 10)' : 'Discount amount (GHS)'}
                placeholderTextColor={colors.textSubtle}
                keyboardType="numeric"
              />
              <TextInput
                style={styles.input}
                value={promoMaxUses}
                onChangeText={setPromoMaxUses}
                placeholder="Max uses (optional)"
                placeholderTextColor={colors.textSubtle}
                keyboardType="numeric"
              />
              <View style={styles.inlineFormActions}>
                <TouchableOpacity style={styles.secondaryButton} onPress={() => setIsPromoFormVisible(false)}>
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.primaryButton}
                  disabled={isSaving || !promoCode.trim() || !promoValue}
                  onPress={handleCreatePromo}
                >
                  <Text style={styles.primaryButtonText}>Create Code</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={styles.addLink} onPress={() => setIsPromoFormVisible(true)}>
              <Ionicons name="add-circle-outline" size={16} color={colors.teal} />
              <Text style={styles.addLinkText}>Add Promo Code</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.section}>
          <SectionHeading>Broadcast Notification</SectionHeading>
          <TextInput
            style={styles.input}
            value={broadcastTitle}
            onChangeText={setBroadcastTitle}
            placeholder="Title"
            placeholderTextColor={colors.textSubtle}
          />
          <TextInput
            style={[styles.input, styles.textArea]}
            value={broadcastBody}
            onChangeText={setBroadcastBody}
            placeholder="Message"
            placeholderTextColor={colors.textSubtle}
            multiline
          />
          <FilterTabs
            tabs={BROADCAST_TARGETS}
            activeKey={broadcastTarget}
            onChange={setBroadcastTarget}
          />
          {!!broadcastResult && <Text style={styles.broadcastResult}>{broadcastResult}</Text>}
          <TouchableOpacity
            style={[styles.primaryButton, (!broadcastTitle.trim() || !broadcastBody.trim()) && styles.primaryButtonDisabled]}
            disabled={isSaving || !broadcastTitle.trim() || !broadcastBody.trim()}
            onPress={() => setIsBroadcastConfirmVisible(true)}
          >
            <Text style={styles.primaryButtonText}>Send Broadcast</Text>
          </TouchableOpacity>
          {isSaving && <ActivityIndicator color={colors.teal} style={{ marginTop: 8 }} />}
        </View>
      </ScrollView>
      </KeyboardAvoidingView>

      <EditFieldModal
        visible={!!editingKey}
        label={[...BUSINESS_KEYS, ...CONTACT_KEYS, ...CANCELLATION_KEYS, ...CURRENCY_KEYS].find((k) => k.key === editingKey)?.label}
        value={editValue}
        onChangeValue={setEditValue}
        numeric={[...BUSINESS_KEYS, ...CANCELLATION_KEYS, ...CURRENCY_KEYS].some((k) => k.key === editingKey)}
        isSaving={isSaving}
        onCancel={() => setEditingKey(null)}
        onSave={saveEdit}
      />

      <ConfirmModal
        visible={isBroadcastConfirmVisible}
        title="Send this broadcast?"
        message={`"${broadcastTitle}" will be sent to ${BROADCAST_TARGETS.find((t) => t.key === broadcastTarget)?.label}.`}
        confirmLabel="Send"
        onConfirm={handleSendBroadcast}
        onCancel={() => setIsBroadcastConfirmVisible(false)}
      />

      <ConfirmModal
        visible={!!deletingPromoId}
        title="Delete this promo code?"
        message="This cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={handleDeletePromo}
        onCancel={() => setDeletingPromoId(null)}
      />
    </View>
  );
}

function EditFieldModal({ visible, label, value, onChangeValue, numeric, isSaving, onCancel, onSave }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  if (!visible) return null;

  return (
    <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onCancel} />
      <View style={styles.modalSheet}>
        <Text style={styles.modalTitle}>{label}</Text>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeValue}
          keyboardType={numeric ? 'numeric' : 'default'}
          autoFocus
        />
        <View style={styles.inlineFormActions}>
          <TouchableOpacity style={styles.secondaryButton} onPress={onCancel}>
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.primaryButton} disabled={isSaving} onPress={onSave}>
            <Text style={styles.primaryButtonText}>Save</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    flex: {
      flex: 1,
    },
    loadingWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
    },
    content: {
      padding: 16,
      paddingBottom: 40,
    },
    errorText: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.error,
      textAlign: 'center',
      marginBottom: 8,
    },
    section: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 16,
      marginTop: 14,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
      gap: 10,
    },
    rowTextWrap: {
      flex: 1,
    },
    rowLabel: {
      fontFamily: FONTS.medium,
      fontSize: 13,
      color: colors.textPrimary,
    },
    rowValue: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textSubtle,
      marginTop: 2,
    },
    emptyText: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textSubtle,
      paddingVertical: 8,
    },
    promoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
      gap: 10,
    },
    promoCodeLine: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    promoCode: {
      fontFamily: FONTS.bold,
      fontSize: 14,
      color: colors.textPrimary,
    },
    promoActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    inlineForm: {
      marginTop: 10,
      gap: 10,
    },
    inlineFormActions: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 4,
    },
    addLink: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 12,
    },
    addLinkText: {
      fontFamily: FONTS.semiBold,
      fontSize: 13,
      color: colors.teal,
    },
    input: {
      fontFamily: FONTS.regular,
      fontSize: 14,
      color: colors.textPrimary,
      backgroundColor: colors.background,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    textArea: {
      minHeight: 80,
      textAlignVertical: 'top',
      marginTop: 10,
    },
    dateButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.background,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    dateButtonText: {
      flex: 1,
      fontFamily: FONTS.medium,
      fontSize: 13,
      color: colors.textPrimary,
    },
    broadcastResult: {
      fontFamily: FONTS.medium,
      fontSize: 12,
      color: colors.success,
      marginTop: 8,
    },
    primaryButton: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.teal,
      borderRadius: 10,
      paddingVertical: 13,
      marginTop: 12,
    },
    primaryButtonDisabled: {
      opacity: 0.5,
    },
    primaryButtonText: {
      fontFamily: FONTS.semiBold,
      fontSize: 14,
      color: colors.white,
    },
    secondaryButton: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 10,
      paddingVertical: 13,
      borderWidth: 1,
      borderColor: colors.teal,
    },
    secondaryButtonText: {
      fontFamily: FONTS.semiBold,
      fontSize: 14,
      color: colors.teal,
    },
    modalBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.5)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    modalSheet: {
      width: '100%',
      maxWidth: 360,
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 20,
      gap: 12,
    },
    modalTitle: {
      fontFamily: FONTS.bold,
      fontSize: 16,
      color: colors.textPrimary,
    },
  });
}
