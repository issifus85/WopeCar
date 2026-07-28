import { useCallback, useRef } from 'react';
import { StyleSheet, View, Text, TouchableWithoutFeedback } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEventListener } from 'expo';
import { FONTS } from '../constants/theme';

const SPLASH_VIDEO = require('../assets/videos/splash.mp4');

// Shown once per cold app launch, after the native static splash (the
// expo-splash-screen image config in app.json) hands off - see
// app/_layout.js's showIntro gate. Muted so autoplay isn't blocked by the
// browser; tapping anywhere (or letting it play out) advances to the app.
export default function SplashVideoScreen({ onFinish }) {
  const insets = useSafeAreaInsets();
  const finishedRef = useRef(false);

  const player = useVideoPlayer(SPLASH_VIDEO, (p) => {
    p.muted = true;
    p.play();
  });

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onFinish();
  }, [onFinish]);

  useEventListener(player, 'playToEnd', finish);

  // The setup callback's play() above can fire before the underlying video
  // element is actually mounted on web, silently no-op'ing (confirmed live -
  // readyState reached 4/HAVE_ENOUGH_DATA while paused stayed true). Once
  // the player reports it's actually ready, play() again to be sure.
  useEventListener(player, 'statusChange', ({ status }) => {
    if (status === 'readyToPlay') {
      player.play();
    }
  });

  return (
    <TouchableWithoutFeedback onPress={finish}>
      <View style={styles.container}>
        <VideoView
          player={player}
          style={styles.video}
          contentFit="contain"
          nativeControls={false}
          allowsFullscreen={false}
        />
        <View style={[styles.skipWrap, { top: insets.top + 16, right: 16 }]}>
          <Text style={styles.skipText}>Tap to skip</Text>
        </View>
      </View>
    </TouchableWithoutFeedback>
  );
}

// Sampled directly from the video's own frames (consistent across the full
// 10s duration) - matches any contentFit="contain" letterbox bars to the
// video's own backdrop so they read as intentional, not as blank margins.
const VIDEO_BACKGROUND_COLOR = '#215462';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: VIDEO_BACKGROUND_COLOR,
  },
  video: {
    flex: 1,
  },
  skipWrap: {
    position: 'absolute',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  skipText: {
    fontFamily: FONTS.medium,
    fontSize: 12,
    color: '#ffffff',
  },
});
