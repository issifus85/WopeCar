import { StyleSheet, Text, View } from 'react-native';

export default function BookingsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Your Bookings</Text>
      <Text style={styles.subtitle}>You have no bookings yet.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
  },
});
