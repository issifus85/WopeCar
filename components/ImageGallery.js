import { useState, useMemo, useRef, useEffect } from 'react';
import { StyleSheet, View, FlatList, Text, Dimensions, TouchableOpacity, PixelRatio } from 'react-native';
import { Image } from 'expo-image';
import { useAppTheme } from '../contexts/ThemeContext';
import { resizeImageUrl, CAR_PHOTO_BLURHASH } from '../utils/imageUrl';

// `onPress`, when given, makes the gallery double as a tap target (e.g. a
// card that opens the car's detail page) - each rendered image gets its own
// small Touchable rather than one Touchable wrapping the whole horizontal
// FlatList from outside. That distinction matters: a Touchable *enclosing*
// a horizontal FlatList intercepts the drag before the list's own scroll
// responder ever sees it (this is what broke swiping in the tile/compact
// card view - CarTileCard used to wrap ImageGallery in a single card-wide
// TouchableOpacity). A Touchable *inside* each FlatList item only reacts to
// a tap within its own bounds, so the FlatList itself still owns the pan
// gesture for the horizontal scroll.
export default function ImageGallery({ images, height = 180, borderRadius = 16, onPress }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [width, setWidth] = useState(Dimensions.get('window').width);
  // Image.prefetch doesn't dedupe - without this, swiping back and forth
  // across the same couple of photos would keep re-issuing identical
  // requests.
  const prefetchedUrls = useRef(new Set());

  // Warms the next (and previous, for swiping back) photo the moment
  // they'd be swiped to, rather than waiting for that swipe to happen -
  // each rendered <Image>'s own priority='low' below still just queues it
  // behind every other in-flight request app-wide, so an explicit prefetch
  // call is a stronger signal that this specific photo is about to be
  // needed. Re-runs on every activeIndex change, so it keeps following the
  // user through a multi-photo gallery, not just warming the first swipe.
  useEffect(() => {
    if (!images || !width) return;
    [activeIndex - 1, activeIndex + 1]
      .filter((i) => i >= 0 && i < images.length)
      .forEach((i) => {
        const resized = resizeImageUrl(images[i], { width: width * PixelRatio.get(), height: height * PixelRatio.get() });
        if (!resized || prefetchedUrls.current.has(resized)) return;
        prefetchedUrls.current.add(resized);
        Image.prefetch(resized, 'memory-disk');
      });
  }, [images, activeIndex, width, height]);

  if (!images || images.length === 0) {
    return (
      <View style={[styles.placeholder, { height, borderRadius }]}>
        <Text style={styles.placeholderText}>🚗</Text>
      </View>
    );
  }

  const handleScroll = (e) => {
    const offsetX = e.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / e.nativeEvent.layoutMeasurement.width);
    setActiveIndex(index);
  };

  return (
    <View
      style={[styles.container, { height, borderRadius }]}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      <FlatList
        data={images}
        keyExtractor={(item, index) => `${item}-${index}`}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        renderItem={({ item, index }) => {
          const image = (
            <Image
              source={{ uri: resizeImageUrl(item, { width: width * PixelRatio.get(), height: height * PixelRatio.get() }) }}
              style={{ width, height }}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={200}
              priority={index === 0 ? 'high' : 'low'}
              placeholder={CAR_PHOTO_BLURHASH}
              placeholderContentFit="cover"
              recyclingKey={item}
            />
          );
          return onPress ? (
            <TouchableOpacity activeOpacity={0.9} onPress={onPress}>
              {image}
            </TouchableOpacity>
          ) : image;
        }}
      />
      {images.length > 1 && (
        <View style={styles.dots}>
          {images.map((_, index) => (
            <View
              key={index}
              style={[styles.dot, index === activeIndex && styles.dotActive]}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      overflow: 'hidden',
      backgroundColor: colors.highlight,
    },
    placeholder: {
      backgroundColor: colors.highlight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    placeholderText: {
      fontSize: 48,
    },
    dots: {
      position: 'absolute',
      bottom: 10,
      left: 0,
      right: 0,
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 5,
    },
    dot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: 'rgba(255,255,255,0.6)',
    },
    dotActive: {
      backgroundColor: colors.white,
      width: 8,
      height: 8,
      borderRadius: 4,
    },
  });
}
