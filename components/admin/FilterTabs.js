import { useMemo } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView } from 'react-native';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';

// Shared pill-tab filter bar - reused across every admin list screen
// (Users, Vendors, Cars, Bookings, Inbox) instead of each one rebuilding
// its own tab row. `tabs` is [{ key, label, count? }]; count renders as a
// small badge next to the label when present (e.g. a "Pending" count).
export default function FilterTabs({ tabs, activeKey, onChange }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scrollView}
      contentContainerStyle={styles.row}
    >
      {tabs.map((tab) => {
        const isActive = tab.key === activeKey;
        return (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, isActive && styles.tabActive]}
            onPress={() => onChange(tab.key)}
          >
            <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{tab.label}</Text>
            {typeof tab.count === 'number' && tab.count > 0 && (
              <View style={[styles.count, isActive && styles.countActive]}>
                <Text style={[styles.countText, isActive && styles.countTextActive]}>{tab.count}</Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    // React Native Web's ScrollView defaults to flexGrow:1 on its own outer
    // node when nothing overrides it - inside a flex column alongside other
    // siblings (a header above, a list below), that made this horizontal
    // pill row silently claim all the leftover vertical space and center
    // the pills inside it, showing up as a big empty gap above and below
    // the pills on every screen that uses FilterTabs.
    scrollView: {
      flexGrow: 0,
      flexShrink: 0,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    tab: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    tabActive: {
      backgroundColor: colors.teal,
      borderColor: colors.teal,
    },
    tabText: {
      fontFamily: FONTS.semiBold,
      fontSize: 13,
      color: colors.textMuted,
    },
    tabTextActive: {
      color: colors.white,
    },
    count: {
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      paddingHorizontal: 4,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.highlight,
    },
    countActive: {
      backgroundColor: 'rgba(255,255,255,0.25)',
    },
    countText: {
      fontFamily: FONTS.bold,
      fontSize: 10,
      color: colors.teal,
    },
    countTextActive: {
      color: colors.white,
    },
  });
}
