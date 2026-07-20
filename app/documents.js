import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS } from '../constants/theme';

export default function DocumentsScreen() {
  return (
    <View style={styles.container}>
      <Ionicons name="folder-outline" size={40} color="#ccc" />
      <Text style={styles.title}>Documents</Text>
      <Text style={styles.subtitle}>Your saved documents will be available here soon.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 6,
  },
  title: {
    fontFamily: FONTS.bold,
    fontSize: 22,
    color: COLORS.navy,
    marginTop: 4,
  },
  subtitle: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
});
