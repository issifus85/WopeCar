import { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../contexts/ThemeContext';
import { FONTS } from '../constants/theme';

// Instagram-style floating pill nav, shared by every bottom tab bar in the
// app (renter, vendor, admin) via <Tabs tabBar={(props) => <FloatingTabBar
// {...props} />}>. Shows each tab's existing `title` option as a small label
// under the icon - the pill floats above content with margin on all sides
// rather than the default flush-to-edge bar, so screens need extra bottom
// padding to avoid content sitting under it. Reuses each Tabs.Screen's
// existing tabBarIcon option, so per-tab icon definitions don't need to
// change to adopt this.
//
// The horizontal inset MUST live on `wrap` (as padding), not on `bar` (as
// margin combined with width:'100%') - a percentage width is resolved
// against the parent's content box and then margin is added on top of that
// in RN's box model, so bar+margin was overflowing past the screen edges
// instead of insetting from them.
export default function FloatingTabBar({ state, descriptors, navigation }) {
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors, insets]);

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 16) }]} pointerEvents="box-none">
      <BlurView intensity={72} tint={isDark ? 'dark' : 'light'} style={styles.bar}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const isFocused = state.index === index;
          const color = isFocused ? colors.teal : colors.textSubtle;
          const icon = options.tabBarIcon?.({ focused: isFocused, color, size: 20 });

          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          return (
            <TouchableOpacity
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={options.title ?? route.name}
              onPress={onPress}
              style={styles.tab}
              activeOpacity={0.7}
            >
              <View style={[styles.iconWrap, isFocused && styles.iconWrapActive]}>
                {icon}
              </View>
              <Text style={[styles.label, { color }]} numberOfLines={1}>
                {options.title ?? route.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </BlurView>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    wrap: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: 28,
      alignItems: 'center',
    },
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      width: '100%',
      maxWidth: 420,
      paddingVertical: 10,
      borderRadius: 28,
      overflow: 'hidden',
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.15,
      shadowRadius: 14,
      elevation: 10,
    },
    tab: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // Selected state is a bold pill behind the icon (Instagram-style),
    // not a dot below it - sized with its own padding rather than a fixed
    // width/height so it stays centered on the icon regardless of exactly
    // how wide/tall a given tab's icon glyph renders.
    iconWrap: {
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconWrapActive: {
      backgroundColor: colors.highlight,
    },
    label: {
      fontFamily: FONTS.medium,
      fontSize: 10,
      marginTop: 3,
    },
  });
}
