import { useMemo, useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../constants/theme';
import { useAppTheme } from '../contexts/ThemeContext';
import DateRangeModal from './DateRangeModal';

const DISCOUNT_TYPE_OPTIONS = [
  { key: 'percentage', label: '%' },
  { key: 'flat', label: 'GHS' },
];

function formatDateLabel(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// Two independent discount mechanisms, both optional:
//  - `discount`: a blanket promotional discount (on/off, %/flat, optional
//    active-date window) that applies to every booking while enabled.
//  - `lengthOfStayDiscounts`: Airbnb-style weekly/monthly tiers that
//    auto-apply based on trip length - see pickLengthOfStayTier() in
//    constants/pricing.js for how the richest eligible tier is chosen.
export default function CarDiscountEditor({
  discount,
  onChangeDiscount,
  lengthOfStayDiscounts,
  onChangeLengthOfStayDiscounts,
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [isDateModalVisible, setIsDateModalVisible] = useState(false);

  const patchDiscount = (patch) => onChangeDiscount({ ...discount, ...patch });

  const addTier = () => {
    onChangeLengthOfStayDiscounts([...lengthOfStayDiscounts, { minDays: '', type: 'percentage', value: '' }]);
  };
  const updateTier = (index, patch) => {
    onChangeLengthOfStayDiscounts(
      lengthOfStayDiscounts.map((tier, i) => (i === index ? { ...tier, ...patch } : tier))
    );
  };
  const removeTier = (index) => {
    onChangeLengthOfStayDiscounts(lengthOfStayDiscounts.filter((_, i) => i !== index));
  };

  return (
    <View>
      <View style={styles.masterRow}>
        <View style={styles.masterLabelWrap}>
          <Text style={styles.masterLabel}>Promotional Discount</Text>
          <Text style={styles.masterSubtitle}>A blanket discount shown as strikethrough pricing while active</Text>
        </View>
        <Switch
          value={discount.enabled}
          onValueChange={(value) => patchDiscount({ enabled: value })}
          trackColor={{ false: colors.disabled, true: colors.teal }}
          thumbColor={colors.white}
        />
      </View>

      {discount.enabled && (
        <View style={styles.card}>
          <View style={styles.field}>
            <Text style={styles.label}>Discount Type</Text>
            <View style={styles.pillsRow}>
              {DISCOUNT_TYPE_OPTIONS.map((opt) => {
                const active = opt.key === discount.type;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={[styles.pill, active && styles.pillActive]}
                    onPress={() => patchDiscount({ type: opt.key })}
                  >
                    <Text style={[styles.pillText, active && styles.pillTextActive]}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>{discount.type === 'percentage' ? 'Discount %' : 'Discount Amount (GHS)'}</Text>
            <TextInput
              style={styles.input}
              value={discount.value}
              onChangeText={(value) => patchDiscount({ value })}
              placeholder={discount.type === 'percentage' ? 'e.g. 10' : 'e.g. 100'}
              placeholderTextColor={colors.textSubtle}
              keyboardType="numeric"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Active Dates (optional)</Text>
            <Text style={styles.hint}>Leave unset to run indefinitely while enabled.</Text>
            <TouchableOpacity style={styles.dateButton} onPress={() => setIsDateModalVisible(true)}>
              <Ionicons name="calendar-outline" size={16} color={colors.teal} />
              <Text style={styles.dateButtonText}>
                {discount.startsAt && discount.endsAt
                  ? `${formatDateLabel(discount.startsAt)} — ${formatDateLabel(discount.endsAt)}`
                  : 'No date limit'}
              </Text>
              {!!(discount.startsAt || discount.endsAt) && (
                <TouchableOpacity
                  onPress={() => patchDiscount({ startsAt: null, endsAt: null })}
                  hitSlop={10}
                >
                  <Ionicons name="close-circle" size={16} color={colors.textSubtle} />
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={[styles.masterRow, styles.masterRowSpaced]}>
        <View style={styles.masterLabelWrap}>
          <Text style={styles.masterLabel}>Length of Trip Discounts</Text>
          <Text style={styles.masterSubtitle}>Automatic discounts for longer trips, like a weekly or monthly rate</Text>
        </View>
      </View>

      {lengthOfStayDiscounts.length > 0 && (
        <View style={styles.card}>
          {lengthOfStayDiscounts.map((tier, index) => (
            <View key={index} style={[styles.tierRow, index === lengthOfStayDiscounts.length - 1 && styles.tierRowLast]}>
              <View style={styles.tierMinDays}>
                <Text style={styles.tierLabel}>Min. days</Text>
                <TextInput
                  style={styles.input}
                  value={String(tier.minDays ?? '')}
                  onChangeText={(value) => updateTier(index, { minDays: value })}
                  placeholder="7"
                  placeholderTextColor={colors.textSubtle}
                  keyboardType="number-pad"
                />
              </View>
              <View style={styles.tierType}>
                <Text style={styles.tierLabel}>Type</Text>
                <View style={styles.pillsRow}>
                  {DISCOUNT_TYPE_OPTIONS.map((opt) => {
                    const active = opt.key === tier.type;
                    return (
                      <TouchableOpacity
                        key={opt.key}
                        style={[styles.pillSmall, active && styles.pillActive]}
                        onPress={() => updateTier(index, { type: opt.key })}
                      >
                        <Text style={[styles.pillText, active && styles.pillTextActive]}>{opt.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
              <View style={styles.tierValue}>
                <Text style={styles.tierLabel}>{tier.type === 'percentage' ? 'Off %' : 'Off (GHS)'}</Text>
                <TextInput
                  style={styles.input}
                  value={String(tier.value ?? '')}
                  onChangeText={(value) => updateTier(index, { value })}
                  placeholder={tier.type === 'percentage' ? '10' : '50'}
                  placeholderTextColor={colors.textSubtle}
                  keyboardType="numeric"
                />
              </View>
              <TouchableOpacity style={styles.tierRemove} onPress={() => removeTier(index)} hitSlop={10}>
                <Ionicons name="trash-outline" size={18} color={colors.error} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      <TouchableOpacity style={styles.addLink} onPress={addTier}>
        <Ionicons name="add-circle-outline" size={16} color={colors.teal} />
        <Text style={styles.addLinkText}>Add a length of trip discount</Text>
      </TouchableOpacity>

      <DateRangeModal
        visible={isDateModalVisible}
        onClose={() => setIsDateModalVisible(false)}
        startDate={discount.startsAt ? new Date(discount.startsAt) : null}
        endDate={discount.endsAt ? new Date(discount.endsAt) : null}
        onApply={(start, end) => {
          const toISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          patchDiscount({ startsAt: start ? toISO(start) : null, endsAt: end ? toISO(end) : null });
        }}
      />
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    masterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 16,
      marginBottom: 16,
      shadowColor: colors.shadow,
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 3,
    },
    masterRowSpaced: {
      marginTop: 8,
    },
    masterLabelWrap: {
      flex: 1,
    },
    masterLabel: {
      fontFamily: FONTS.semiBold,
      fontSize: 14,
      color: colors.textPrimary,
    },
    masterSubtitle: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textSubtle,
      marginTop: 2,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 16,
      marginBottom: 16,
      shadowColor: colors.shadow,
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 3,
    },
    field: {
      marginBottom: 16,
    },
    label: {
      fontFamily: FONTS.semiBold,
      fontSize: 13,
      color: colors.textPrimary,
      marginBottom: 8,
    },
    hint: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textSubtle,
      marginTop: -4,
      marginBottom: 8,
    },
    input: {
      backgroundColor: colors.background,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontFamily: FONTS.regular,
      fontSize: 14,
      color: colors.textPrimary,
    },
    pillsRow: {
      flexDirection: 'row',
      gap: 8,
    },
    pill: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: colors.border,
    },
    pillSmall: {
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1.5,
      borderColor: colors.border,
    },
    pillActive: {
      backgroundColor: colors.teal,
      borderColor: colors.teal,
    },
    pillText: {
      fontFamily: FONTS.medium,
      fontSize: 12,
      color: colors.textMuted,
    },
    pillTextActive: {
      fontFamily: FONTS.semiBold,
      color: colors.white,
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
    tierRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 8,
      paddingBottom: 14,
      marginBottom: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    tierRowLast: {
      paddingBottom: 0,
      marginBottom: 0,
      borderBottomWidth: 0,
    },
    tierMinDays: {
      flex: 1,
    },
    tierType: {
      flex: 1.4,
    },
    tierValue: {
      flex: 1,
    },
    tierLabel: {
      fontFamily: FONTS.regular,
      fontSize: 10,
      color: colors.textSubtle,
      marginBottom: 6,
    },
    tierRemove: {
      paddingBottom: 12,
    },
    addLink: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 16,
    },
    addLinkText: {
      fontFamily: FONTS.semiBold,
      fontSize: 13,
      color: colors.teal,
    },
  });
}
