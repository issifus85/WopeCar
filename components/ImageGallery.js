import { useState, useMemo } from 'react';
import { StyleSheet, View, FlatList, Text, Dimensions, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { useAppTheme } from '../contexts/ThemeContext';

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
        renderItem={({ item }) => {
          const image = <Image source={{ uri: item }} style={{ width, height }} contentFit="cover" />;
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
