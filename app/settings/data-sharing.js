import { useMemo } from 'react';
import { StyleSheet, Text, View, Switch } from 'react-native';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useSettings } from '../../contexts/SettingsContext';

const CATEGORIES = [
  {
    key: 'dataSharingAnalytics',
    label: 'Analytics & Usage Data',
    body: 'Share anonymous app usage data (screens viewed, features used) to help WopeCar improve the app.',
  },
  {
    key: 'dataSharingPersonalizedAds',
    label: 'Personalized Ads',
    body: "Use your activity to show ads that are more relevant to you, rather than generic ones.",
  },
  {
    key: 'dataSharingThirdParty',
    label: 'Third-Party Data Sharing',
    body: 'Share account data with WopeCar partners for purposes beyond running the app itself.',
  },
];

export default function DataSharingScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { settings, updateSetting } = useSettings();

  return (
    <View style={styles.container}>
      <Text style={styles.intro}>
        Control what data WopeCar shares beyond what's needed to run your bookings. These preferences are saved to
        your account and can be changed anytime.
      </Text>

      <View style={styles.card}>
        {CATEGORIES.map((category, index) => (
          <View
            key={category.key}
            style={[styles.row, index === CATEGORIES.length - 1 && styles.rowLast]}
          >
            <View style={styles.rowTextWrap}>
              <Text style={styles.rowLabel}>{category.label}</Text>
              <Text style={styles.rowBody}>{category.body}</Text>
            </View>
            <Switch
              value={!!settings[category.key]}
              onValueChange={(value) => updateSetting(category.key, value)}
              trackColor={{ false: colors.disabled, true: colors.teal }}
              thumbColor={colors.white}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      padding: 16,
    },
    intro: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textSubtle,
      lineHeight: 19,
      marginBottom: 16,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      paddingHorizontal: 16,
      shadowColor: colors.shadow,
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 2,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    rowLast: {
      borderBottomWidth: 0,
    },
    rowTextWrap: {
      flex: 1,
    },
    rowLabel: {
      fontFamily: FONTS.semiBold,
      fontSize: 14,
      color: colors.textPrimary,
      marginBottom: 4,
    },
    rowBody: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textSubtle,
      lineHeight: 17,
    },
  });
}
