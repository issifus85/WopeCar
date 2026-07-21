import { useRef } from 'react';
import { Animated, PanResponder, View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../constants/theme';

const ACTION_WIDTH = 76;
const TAP_SLOP = 6;
const OPEN_THRESHOLD_RATIO = 0.4;

// Custom swipe-to-reveal-actions row, built on React Native's built-in
// Animated + PanResponder (no react-native-gesture-handler/reanimated in
// this project). onStartShouldSetPanResponder stays false and
// onMoveShouldSetPanResponder only claims the gesture once the drag is
// clearly horizontal, so vertical drags are left alone for the parent
// FlatList/ScrollView to scroll normally.
export default function SwipeableRow({ children, actions, onPress, colors }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const isOpen = useRef(false);
  const maxSwipe = actions.length * ACTION_WIDTH;
  const styles = createStyles(colors);

  const animateTo = (toValue, open) => {
    isOpen.current = open;
    // useNativeDriver: false - animating `left` (a layout property, not a
    // transform) so this can't run on the native driver. That's also what
    // sidesteps a react-native-web bug where a GPU-promoted transformed
    // sibling doesn't reliably paint above the (untransformed) actions
    // underneath it - animating layout position keeps everything in one
    // normal paint/stacking order instead.
    Animated.spring(translateX, { toValue, useNativeDriver: false, bounciness: 0, speed: 20 }).start();
  };
  const close = () => animateTo(0, false);
  const open = () => animateTo(-maxSwipe, true);

  // Actions fade in with swipe progress instead of relying purely on
  // `content` opaquely covering them at rest - a defensive belt-and-braces
  // fix for a react-native-web quirk where an animated sibling doesn't
  // always paint reliably above/below an adjacent layer at zero offset.
  const actionsOpacity = translateX.interpolate({
    inputRange: [-maxSwipe, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > 10 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
      onPanResponderMove: (_, gesture) => {
        const base = isOpen.current ? -maxSwipe : 0;
        const next = Math.max(-maxSwipe, Math.min(0, base + gesture.dx));
        translateX.setValue(next);
      },
      onPanResponderRelease: (_, gesture) => {
        if (Math.abs(gesture.dx) < TAP_SLOP && Math.abs(gesture.dy) < TAP_SLOP) {
          if (isOpen.current) close();
          else onPress?.();
          return;
        }
        const base = isOpen.current ? -maxSwipe : 0;
        const finalX = base + gesture.dx;
        if (finalX < -maxSwipe * OPEN_THRESHOLD_RATIO) open();
        else close();
      },
      onPanResponderTerminationRequest: () => true,
    })
  ).current;

  return (
    <View style={styles.wrapper}>
      <View style={styles.clip}>
        <Animated.View style={[styles.actionsRow, { width: maxSwipe, opacity: actionsOpacity }]}>
          {actions.map((action) => (
            <TouchableOpacity
              key={action.label}
              style={[styles.actionButton, { backgroundColor: action.color, width: ACTION_WIDTH }]}
              onPress={() => {
                close();
                action.onPress();
              }}
            >
              <Ionicons name={action.icon} size={19} color={colors.white} />
              <Text style={styles.actionText}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </Animated.View>
        <Animated.View style={[styles.content, { left: translateX }]} {...panResponder.panHandlers}>
          {children}
        </Animated.View>
      </View>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    wrapper: {
      position: 'relative',
      borderRadius: 12,
      marginBottom: 10,
      shadowColor: colors.shadow,
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 2,
    },
    // Single shared clip mask for both layers - rounding actionsRow and
    // content separately leaves a seam where their independent rounded
    // corners don't perfectly overlap.
    clip: {
      position: 'relative',
      borderRadius: 12,
      overflow: 'hidden',
    },
    actionsRow: {
      position: 'absolute',
      right: 0,
      top: 0,
      bottom: 0,
      flexDirection: 'row',
      zIndex: 0,
    },
    actionButton: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
    },
    actionText: {
      fontFamily: FONTS.semiBold,
      fontSize: 11,
      color: colors.white,
    },
    content: {
      backgroundColor: colors.surface,
      zIndex: 1,
    },
  });
}
