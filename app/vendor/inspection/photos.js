import { useMemo, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { File, Directory, Paths } from 'expo-file-system';
import { FONTS } from '../../../constants/theme';
import { useAppTheme } from '../../../contexts/ThemeContext';
import { useInspection } from '../../../contexts/InspectionContext';
import { syncInspection, uploadInspectionPhoto } from '../../../services/inspectionsApi';
import { PHOTO_CATEGORIES, PHOTO_ANGLES } from '../../../constants/inspectionPhotos';
import InspectionHeader from '../../../components/InspectionHeader';
import CheckoutFooterButton from '../../../components/CheckoutFooterButton';

// Same persistence reasoning as app/inspection/photos.js - copies the
// picker/camera's transient cache uri into the app's document directory so
// it survives an app restart mid-inspection.
async function persistPhoto(sourceUri, angle) {
  if (Platform.OS === 'web') return sourceUri;
  const dir = new Directory(Paths.document, 'vendor-inspection-photos');
  dir.create({ idempotent: true });
  const destination = new File(dir, `${angle}_${Date.now()}.jpg`);
  new File(sourceUri).copy(destination);
  return destination.uri;
}

// Vendor Mode variant of app/inspection/photos.js - now shares the same
// real backend as the renter-side wizard (see signatures.js's header
// comment for why this stopped being a local-only copy).
export default function VendorInspectionPhotosScreen() {
  const { bookingId, type } = useLocalSearchParams();
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { draft, updateDraft } = useInspection();
  const [capturingAngle, setCapturingAngle] = useState(null);

  // Photos upload one-by-one as they're captured (not batched at the end),
  // matching the renter-side wizard exactly - a mid-wizard connection drop
  // doesn't lose already-uploaded shots.
  const ensureServerId = async () => {
    if (draft.serverId) return draft.serverId;
    try {
      const inspection = await syncInspection(bookingId, {
        type,
        mileage: draft.mileage,
        fuelLevel: draft.fuelLevel,
        checklist: draft.checklist,
        damagePoints: draft.damagePoints,
      });
      updateDraft({ serverId: inspection.id, pendingSync: false });
      return inspection.id;
    } catch (e) {
      updateDraft({ pendingSync: true });
      return null;
    }
  };

  const captureAngle = async (angle) => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Camera access needed', 'Enable camera access in your device settings to capture inspection photos.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (result.canceled || !result.assets?.[0]) return;

    setCapturingAngle(angle);
    try {
      const persistedUri = await persistPhoto(result.assets[0].uri, angle);

      // GPS tag is best-effort only, same as the renter-side flow.
      let coords = null;
      try {
        const locPermission = await Location.requestForegroundPermissionsAsync();
        if (locPermission.status === 'granted') {
          const position = await Location.getCurrentPositionAsync({});
          coords = { latitude: position.coords.latitude, longitude: position.coords.longitude };
        }
      } catch (e) {
        // Ignored - see comment above.
      }

      updateDraft({ photos: { ...draft.photos, [angle]: persistedUri } });

      const inspectionId = await ensureServerId();
      if (inspectionId) {
        await uploadInspectionPhoto(inspectionId, angle, persistedUri, { ...coords, capturedAt: new Date().toISOString() });
      }
    } finally {
      setCapturingAngle(null);
    }
  };

  const capturedCount = PHOTO_ANGLES.filter((a) => draft.photos[a.key]).length;
  const isValid = capturedCount === PHOTO_ANGLES.length;

  const handleContinue = () => {
    router.push({ pathname: '/vendor/inspection/signatures', params: { bookingId, type } });
  };

  return (
    <View style={styles.container}>
      <InspectionHeader title="Vehicle Photos" step={4} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.hint}>
          Capture all {PHOTO_ANGLES.length} required photos ({capturedCount} of {PHOTO_ANGLES.length}). Tap a tile to open the camera.
        </Text>

        {PHOTO_CATEGORIES.map((category) => {
          const categoryCaptured = category.angles.filter((a) => draft.photos[a.key]).length;
          const categoryComplete = categoryCaptured === category.angles.length;
          return (
            <View key={category.key} style={styles.categorySection}>
              <View style={styles.categoryHeaderRow}>
                <Text style={styles.categoryTitle}>
                  {category.title.toUpperCase()} — {categoryCaptured} of {category.angles.length}
                </Text>
                {categoryComplete && <Ionicons name="checkmark-circle" size={14} color={colors.success} />}
              </View>

              <View style={styles.grid}>
                {category.angles.map((a) => {
                  const uri = draft.photos[a.key];
                  const isCapturing = capturingAngle === a.key;
                  return (
                    <TouchableOpacity
                      key={a.key}
                      style={styles.tileWrap}
                      onPress={() => captureAngle(a.key)}
                      disabled={isCapturing}
                    >
                      <View style={styles.tile}>
                        {uri ? (
                          <Image source={{ uri }} style={styles.thumbnail} contentFit="cover" />
                        ) : (
                          <Ionicons name="camera-outline" size={28} color={colors.textSubtle} />
                        )}
                        {isCapturing && (
                          <View style={styles.tileOverlay}>
                            <ActivityIndicator color={colors.white} />
                          </View>
                        )}
                        {!!uri && !isCapturing && (
                          <View style={styles.checkBadge}>
                            <Ionicons name="checkmark-circle" size={18} color={colors.teal} />
                          </View>
                        )}
                        {!uri && !isCapturing && <View style={styles.requiredDot} />}
                        <Text style={styles.tileLabel} numberOfLines={1}>{a.label}</Text>
                      </View>
                      <Text style={styles.tileHint} numberOfLines={1}>{a.hint ?? ' '}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          );
        })}

        <Text style={[styles.captureCount, isValid && styles.captureCountComplete]}>
          {isValid ? `${PHOTO_ANGLES.length} of ${PHOTO_ANGLES.length} photos captured ✓` : `${capturedCount} of ${PHOTO_ANGLES.length} photos captured`}
        </Text>
      </ScrollView>

      <CheckoutFooterButton label="Continue →" onPress={handleContinue} disabled={!isValid} />
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
      marginBottom: 20,
    },
    categorySection: {
      marginBottom: 22,
    },
    categoryHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 10,
    },
    categoryTitle: {
      fontFamily: FONTS.bold,
      fontSize: 11,
      color: colors.teal,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    tileWrap: {
      width: '31%',
    },
    tile: {
      width: '100%',
      aspectRatio: 1,
      borderRadius: 12,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    thumbnail: {
      width: '100%',
      height: '100%',
    },
    tileOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.35)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkBadge: {
      position: 'absolute',
      top: 4,
      right: 4,
      backgroundColor: colors.surface,
      borderRadius: 10,
    },
    requiredDot: {
      position: 'absolute',
      top: 6,
      right: 6,
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: colors.error,
    },
    tileLabel: {
      position: 'absolute',
      bottom: 4,
      fontFamily: FONTS.medium,
      fontSize: 10,
      color: colors.textPrimary,
      backgroundColor: colors.surface,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
      overflow: 'hidden',
      maxWidth: '92%',
      textAlign: 'center',
    },
    tileHint: {
      fontFamily: FONTS.regular,
      fontSize: 9,
      color: colors.textSubtle,
      textAlign: 'center',
      marginTop: 4,
    },
    captureCount: {
      fontFamily: FONTS.semiBold,
      fontSize: 13,
      color: colors.textSubtle,
      textAlign: 'center',
      marginTop: 4,
    },
    captureCountComplete: {
      color: colors.success,
    },
  });
}
