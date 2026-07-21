import { useRef } from 'react';
import { Animated, PanResponder, Pressable, View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../constants/theme';

const ACTION_WIDTH = 76;
const OPEN_THRESHOLD_RATIO = 0.4;

// Custom swipe-to-reveal-actions row, built on React Native's built-in
// Animated + PanResponder (no react-native-gesture-handler/reanimated in
// this project).
//
// Tap and swipe are handled by two separate mechanisms, not one: a real
// Pressable owns tapping (children), while the PanResponder only ever
// claims the gesture once a drag is unambiguously horizontal
// (onMoveShouldSetPanResponderCapture, evaluated top-down before the
// inner Pressable locks in its own press). A still tap - the ordinary
// case, no meaningful dx/dy - never crosses that threshold, so the
// PanResponder is never granted and the Pressable's onPress fires
// normally and instantly. Earlier this used a single PanResponder for
// both (treating "released with ~0 movement" as a tap inside
// onPanResponderRelease), but onMoveShouldSetPanResponder requires
// movement to fire at all, so a truly still tap never triggered release
// and onPress never ran - and real fingers' natural jitter meant some
// taps randomly *did* cross the movement threshold, making the whole
// row feel inconsistent between "does nothing" and "half-swipes."
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
    Animated.timing(translateX, { toValue, duration: 200, useNativeDriver: false }).start();
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

  const isHorizontalDrag = (gesture) =>
    Math.abs(gesture.dx) > 10 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      // Capture phase (evaluated top-down, before the inner Pressable's own
      // responder claim on tap-down) is what lets a real drag steal the
      // gesture away from the Pressable once it's unambiguous - a still
      // tap never satisfies isHorizontalDrag, so the Pressable underneath
      // keeps the touch and fires its own onPress normally.
      onMoveShouldSetPanResponderCapture: (_, gesture) => isHorizontalDrag(gesture),
      onMoveShouldSetPanResponder: (_, gesture) => isHorizontalDrag(gesture),
      onPanResponderMove: (_, gesture) => {
        const base = isOpen.current ? -maxSwipe : 0;
        const next = Math.max(-maxSwipe, Math.min(0, base + gesture.dx));
        translateX.setValue(next);
      },
      onPanResponderRelease: (_, gesture) => {
        const base = isOpen.current ? -maxSwipe : 0;
        const finalX = base + gesture.dx;
        if (finalX < -maxSwipe * OPEN_THRESHOLD_RATIO) open();
        else close();
      },
      onPanResponderTerminationRequest: () => true,
    })
  ).current;

  const handlePress = () => {
    if (isOpen.current) close();
    else onPress?.();
  };

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
          <Pressable onPress={handlePress}>
            {children}
          </Pressable>
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
