import { Component } from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS } from '../constants/theme';

// Nothing else in this app catches a render-time JS exception - a single
// uncaught throw anywhere below this (a bad API response shape, a null
// dereference, anything) reaches React with no boundary to stop it. In a
// standalone/TestFlight build (this app ships via expo-updates, not just
// Expo Go) that's fatal: RN's default handler hard-terminates the whole
// app with no red box and no recovery, which is exactly what "the app
// closes out completely" describes - there's no dev-mode red screen to
// soften it once this is running as a real build on someone's phone.
// Wrapping the app once here turns that class of bug into a recoverable
// in-app screen instead of a full crash, regardless of which component or
// screen actually threw. "Try Again" just resets local state to remount
// the children fresh - it can't fix a bug that reliably reproduces on
// every render of the same screen, but it recovers instantly from anything
// transient (a flaky response, a race on mount) without forcing a full
// app relaunch.
export default class ErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] Uncaught render error:', error, info?.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Ionicons name="alert-circle-outline" size={48} color={COLORS.teal} />
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.body}>
            Sorry about that - please try again. If this keeps happening, force-quitting and
            reopening the app usually clears it.
          </Text>
          <TouchableOpacity style={styles.button} onPress={this.handleReset}>
            <Text style={styles.buttonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingTop: 60,
    backgroundColor: '#f5f5f5',
    gap: 10,
  },
  title: {
    fontFamily: FONTS.bold,
    fontSize: 18,
    color: COLORS.navy,
    marginTop: 4,
  },
  body: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: '#666666',
    textAlign: 'center',
    lineHeight: 20,
  },
  button: {
    marginTop: 12,
    backgroundColor: COLORS.teal,
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  buttonText: {
    fontFamily: FONTS.semiBold,
    fontSize: 14,
    color: '#ffffff',
  },
});
