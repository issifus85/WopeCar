import { useState, useMemo } from 'react';
import { StyleSheet, View, Image, FlatList, Text, Dimensions } from 'react-native';
import { useAppTheme } from '../contexts/ThemeContext';

export default function ImageGallery({ images, height = 180, borderRadius = 16 }) {
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
        renderItem={({ item }) => (
          <Image
            source={{ uri: item }}
            style={{ width, height }}
            resizeMode="cover"
          />
        )}
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
