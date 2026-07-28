import { useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Pressable, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FONTS } from '../../../constants/theme';
import { useAppTheme } from '../../../contexts/ThemeContext';
import { useInspection } from '../../../contexts/InspectionContext';
import InspectionHeader from '../../../components/InspectionHeader';
import CheckoutFooterButton from '../../../components/CheckoutFooterButton';
import ConfirmModal from '../../../components/ConfirmModal';

const VIEWS = [
  { key: 'front', label: 'Front' },
  { key: 'rear', label: 'Rear' },
  { key: 'left', label: 'Left' },
  { key: 'right', label: 'Right' },
  { key: 'roof', label: 'Roof' },
  { key: 'windshield', label: 'Windshield' },
];

const DAMAGE_TYPES = [
  { key: 'scratch', label: 'Scratch', color: '#e0a020' },
  { key: 'dent', label: 'Dent', color: '#d64545' },
  { key: 'crack', label: 'Crack', color: '#7a4fd6' },
];

function damageColor(type) {
  return DAMAGE_TYPES.find((d) => d.key === type)?.color ?? '#999';
}

// Vendor Mode variant of app/inspection/exterior.js - see mileage.js's
// header comment for why this is a separate, backend-free copy.
export default function VendorInspectionExteriorScreen() {
  const { bookingId, type } = useLocalSearchParams();
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { draft, updateDraft } = useInspection();

  const [activeView, setActiveView] = useState('front');
  const [pendingTap, setPendingTap] = useState(null);
  const [pendingRemoveIndex, setPendingRemoveIndex] = useState(null);
  const diagramRef = useRef(null);

  const pointsForView = draft.damagePoints
    .map((point, index) => ({ ...point, index }))
    .filter((point) => point.view === activeView);

  const handleDiagramPress = (e) => {
    const { pageX, pageY } = e.nativeEvent;
    const node = diagramRef.current;
    if (!node?.measure) return;
    node.measure((x, y, width, height, pageXOffset, pageYOffset) => {
      if (!width || !height) return;
      const xPct = Math.max(0, Math.min(100, ((pageX - pageXOffset) / width) * 100));
      const yPct = Math.max(0, Math.min(100, ((pageY - pageYOffset) / height) * 100));
      setPendingTap({ xPct, yPct });
    });
  };

  const commitDamageType = (damageType) => {
    if (!pendingTap) return;
    updateDraft({
      damagePoints: [
        ...draft.damagePoints,
        { view: activeView, xPct: pendingTap.xPct, yPct: pendingTap.yPct, damageType, note: null },
      ],
    });
    setPendingTap(null);
  };

  const confirmRemovePoint = () => {
    const next = draft.damagePoints.filter((_, i) => i !== pendingRemoveIndex);
    updateDraft({ damagePoints: next });
    setPendingRemoveIndex(null);
  };

  const handleContinue = () => {
    router.push({ pathname: '/vendor/inspection/interior', params: { bookingId, type } });
  };

  return (
    <View style={styles.container}>
      <InspectionHeader title="Exterior Damage" step={2} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.hint}>Tap the diagram to mark existing damage. Tap a marker to remove it.</Text>

        <View style={styles.viewTabs}>
          {VIEWS.map((v) => {
            const count = draft.damagePoints.filter((p) => p.view === v.key).length;
            return (
              <TouchableOpacity
                key={v.key}
                style={[styles.viewTab, activeView === v.key && styles.viewTabActive]}
                onPress={() => setActiveView(v.key)}
              >
                <Text style={[styles.viewTabText, activeView === v.key && styles.viewTabTextActive]}>
                  {v.label}{count > 0 ? ` (${count})` : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Pressable
          ref={diagramRef}
          style={styles.diagram}
          onPress={handleDiagramPress}
        >
          <Text style={styles.diagramLabel}>{VIEWS.find((v) => v.key === activeView)?.label} View</Text>
          <Text style={styles.diagramSubLabel}>Tap to mark damage</Text>

          {pointsForView.map((point) => (
            <TouchableOpacity
              key={point.index}
              style={[
                styles.pin,
                {
                  left: `${point.xPct}%`,
                  top: `${point.yPct}%`,
                  backgroundColor: damageColor(point.damageType),
                },
              ]}
              onPress={() => setPendingRemoveIndex(point.index)}
              hitSlop={8}
            />
          ))}
        </Pressable>

        <View style={styles.legend}>
          {DAMAGE_TYPES.map((d) => (
            <View key={d.key} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: d.color }]} />
              <Text style={styles.legendText}>{d.label}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <CheckoutFooterButton label="Continue" onPress={handleContinue} />

      {!!pendingTap && (
        <View style={styles.typePickerOverlay} pointerEvents="box-none">
          <View style={styles.typePickerSheet}>
            <Text style={styles.typePickerTitle}>What kind of damage?</Text>
            <View style={styles.typePickerRow}>
              {DAMAGE_TYPES.map((d) => (
                <TouchableOpacity key={d.key} style={styles.typeOption} onPress={() => commitDamageType(d.key)}>
                  <View style={[styles.legendDot, { backgroundColor: d.color }]} />
                  <Text style={styles.typeOptionText}>{d.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity onPress={() => setPendingTap(null)}>
              <Text style={styles.typePickerCancel}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <ConfirmModal
        visible={pendingRemoveIndex !== null}
        title="Remove Marker"
        message="Remove this damage marker?"
        confirmLabel="Remove"
        destructive
        onConfirm={confirmRemovePoint}
        onCancel={() => setPendingRemoveIndex(null)}
      />
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    scrollContent: {
      padding: 20,
      paddingBottom: 40,
    },
    hint: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textSubtle,
      marginBottom: 14,
    },
    viewTabs: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 16,
    },
    viewTab: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
    },
    viewTabActive: {
      backgroundColor: colors.teal,
      borderColor: colors.teal,
    },
    viewTabText: {
      fontFamily: FONTS.medium,
      fontSize: 12,
      color: colors.textMuted,
    },
    viewTabTextActive: {
      fontFamily: FONTS.semiBold,
      color: colors.white,
    },
    diagram: {
      height: 260,
      borderRadius: 16,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    diagramLabel: {
      fontFamily: FONTS.bold,
      fontSize: 16,
      color: colors.textPrimary,
    },
    diagramSubLabel: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textSubtle,
      marginTop: 4,
    },
    pin: {
      position: 'absolute',
      width: 18,
      height: 18,
      borderRadius: 9,
      marginLeft: -9,
      marginTop: -9,
      borderWidth: 2,
      borderColor: colors.white,
    },
    legend: {
      flexDirection: 'row',
      gap: 16,
      marginTop: 14,
    },
    legendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    legendDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    legendText: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textMuted,
    },
    typePickerOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.4)',
      alignItems: 'center',
      justifyContent: 'flex-end',
    },
    typePickerSheet: {
      width: '100%',
      backgroundColor: colors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 20,
      paddingBottom: 32,
    },
    typePickerTitle: {
      fontFamily: FONTS.bold,
      fontSize: 16,
      color: colors.textPrimary,
      marginBottom: 16,
      textAlign: 'center',
    },
    typePickerRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      marginBottom: 16,
    },
    typeOption: {
      alignItems: 'center',
      gap: 8,
      padding: 10,
    },
    typeOptionText: {
      fontFamily: FONTS.semiBold,
      fontSize: 13,
      color: colors.textPrimary,
    },
    typePickerCancel: {
      fontFamily: FONTS.medium,
      fontSize: 14,
      color: colors.textSubtle,
      textAlign: 'center',
    },
  });
}
