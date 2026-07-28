import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Modal, Pressable, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../constants/theme';
import { useAppTheme } from '../contexts/ThemeContext';
import * as placesApi from '../services/placesApi';

const MIN_QUERY_LENGTH = 2;

// Bottom-sheet structure mirrors components/InviteParticipantModal.js.
// Generic enough to back both the pickup and return location fields.
export default function LocationSearchModal({ visible, onClose, title = 'Search Location', onSelect }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (!visible) {
      setQuery('');
      setResults([]);
    }
  }, [visible]);

  useEffect(() => {
    if (!visible || query.trim().length < MIN_QUERY_LENGTH) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      setIsSearching(true);
      placesApi.searchPlaces(query.trim())
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setIsSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query, visible]);

  const handleSelect = (place) => {
    onSelect(place.description);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoider}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search for a location..."
            placeholderTextColor={colors.textSubtle}
            autoFocus
          />

          {isSearching ? (
            <ActivityIndicator style={styles.loader} color={colors.teal} />
          ) : results.length === 0 ? (
            <Text style={styles.emptyText}>
              {query.trim().length < MIN_QUERY_LENGTH ? 'Start typing to search.' : 'No matching locations.'}
            </Text>
          ) : (
            <ScrollView style={styles.resultsList} showsVerticalScrollIndicator={false}>
              {results.map((place) => (
                <TouchableOpacity
                  key={place.placeId}
                  style={styles.optionRow}
                  onPress={() => handleSelect(place)}
                >
                  <Ionicons name="location-outline" size={18} color={colors.teal} />
                  <Text style={styles.optionText} numberOfLines={2}>{place.description}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    keyboardAvoider: {
      flex: 1,
    },
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 20,
      paddingBottom: 30,
      maxHeight: '75%',
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    headerTitle: {
      fontFamily: FONTS.bold,
      fontSize: 18,
      color: colors.textPrimary,
    },
    searchInput: {
      fontFamily: FONTS.regular,
      fontSize: 14,
      color: colors.textPrimary,
      backgroundColor: colors.background,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 8,
    },
    loader: {
      marginVertical: 20,
    },
    resultsList: {
      maxHeight: 320,
    },
    emptyText: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textSubtle,
      textAlign: 'center',
      paddingVertical: 20,
    },
    optionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 12,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
    },
    optionText: {
      flex: 1,
      fontFamily: FONTS.regular,
      fontSize: 14,
      color: colors.textPrimary,
    },
  });
}
