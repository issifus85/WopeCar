import { useMemo, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { File, Directory, Paths } from 'expo-file-system';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useInspection } from '../../contexts/InspectionContext';
import { syncInspection, uploadInspectionPhoto } from '../../services/inspectionsApi';
import InspectionHeader from '../../components/InspectionHeader';
import CheckoutFooterButton from '../../components/CheckoutFooterButton';

const ANGLES = [
  { key: 'front', label: 'Front' },
  { key: 'back', label: 'Back' },
  { key: 'left', label: 'Left Side' },
  { key: 'right', label: 'Right Side' },
  { key: 'odometer', label: 'Odometer' },
];

// The picker/camera's returned uri lives in a transient OS cache that isn't
// guaranteed to survive an app restart mid-inspection - copying it into the
// app's persistent document directory is what makes the offline-resume
// story (see InspectionContext.js) actually hold for photos. This File/
// Directory API is Android/iOS/tvOS only (no web support at all), so on web
// the picker's own uri is used as-is - there's no OS-level "app directory"
// concept in a browser anyway, and web is a dev-preview target here, not
// the shipped platform for this camera flow.
async function persistPhoto(sourceUri, angle) {
  if (Platform.OS === 'web') return sourceUri;
  const dir = new Directory(Paths.document, 'inspection-photos');
  dir.create({ idempotent: true });
  const destination = new File(dir, `${angle}_${Date.now()}.jpg`);
  new File(sourceUri).copy(destination);
  return destination.uri;
}

export default function InspectionPhotosScreen() {
  const { bookingId, localId, type } = useLocalSearchParams();
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { draft, updateDraft } = useInspection();
  const [capturingAngle, setCapturingAngle] = useState(null);

  // Photos upload one-by-one as they're captured (not batched at the end),
  // so a mid-wizard connection drop doesn't lose already-uploaded shots -
  // that needs a synced inspection id up front, matching the best-effort
  // sync already attempted on every other step of this wizard.
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

      // GPS tag is best-effort only - never blocks the photo itself, since
      // location can be denied, unavailable indoors, or simply slow.
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
        try {
          await uploadInspectionPhoto(inspectionId, angle, persistedUri, {
            latitude: coords?.latitude,
            longitude: coords?.longitude,
            capturedAt: new Date().toISOString(),
          });
          updateDraft({ pendingSync: false });
        } catch (e) {
          updateDraft({ pendingSync: true });
        }
      }
    } finally {
      setCapturingAngle(null);
    }
  };

  const capturedCount = ANGLES.filter((a) => draft.photos[a.key]).length;
  const isValid = capturedCount === ANGLES.length;

  const handleContinue = () => {
    router.push({ pathname: '/inspection/signatures', params: { bookingId, localId, type } });
  };

  return (
    <View style={styles.container}>
      <InspectionHeader title="Vehicle Photos" step={4} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.hint}>
          Capture all 5 required photos ({capturedCount} of {ANGLES.length}). Tap a tile to open the camera.
        </Text>

        <View style={styles.grid}>
          {ANGLES.map((a) => {
            const uri = draft.photos[a.key];
            const isCapturing = capturingAngle === a.key;
            return (
              <TouchableOpacity
                key={a.key}
                style={styles.tile}
                onPress={() => captureAngle(a.key)}
                disabled={isCapturing}
              >
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
                <Text style={styles.tileLabel}>{a.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <CheckoutFooterButton label="Continue" onPress={handleContinue} disabled={!isValid} />
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
      marginBottom: 16,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    tile: {
      width: '31%',
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
    },
  });
}
