import { StyleSheet, Text, View } from 'react-native';
import { COLORS, FONTS } from '../../constants/theme';

export default function InboxScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Inbox</Text>
      <Text style={styles.subtitle}>You have no messages yet.</Text>
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
  },
  title: {
    fontFamily: FONTS.bold,
    fontSize: 22,
    color: COLORS.navy,
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: '#666',
  },
});
