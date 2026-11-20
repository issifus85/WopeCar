// Address field with Google place suggestions right under it as you type (Ghana only, via places-autocomplete).
// Free text is always accepted: a suggestion just fills the field. The search button opens the full-screen search
// already filled with what was typed.
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ActivityIndicator, Keyboard } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import LocationSearchModal from '../LocationSearchModal';
import * as placesApi from '../../services/placesApi';

const MIN_QUERY_LENGTH = 3;

export default function PlaceInput({ value, onChangeText, placeholder, title, inputStyle }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  // Only look up what the user typed, not a value that was picked or prefilled.
  const typedRef = useRef(false);

  useEffect(() => {
    const q = (value ?? '').trim();
    if (!typedRef.current || q.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setSearching(false);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      setSearching(true);
      placesApi.searchPlaces(q)
        .then((r) => { if (!cancelled) setResults((r ?? []).slice(0, 5)); })
        .catch(() => { if (!cancelled) setResults([]); })
        .finally(() => { if (!cancelled) setSearching(false); });
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [value]);

  const pick = (description) => {
    typedRef.current = false;
    setResults([]);
    Keyboard.dismiss();
    onChangeText(description);
  };

  return (
    <View>
      <View style={styles.row}>
        <View style={styles.inputWrap}>
          <TextInput
            style={[inputStyle, styles.input]}
            value={value}
            onChangeText={(t) => { typedRef.current = true; onChangeText(t); }}
            placeholder={placeholder}
            placeholderTextColor={colors.textSubtle}
            returnKeyType="search"
            onSubmitEditing={() => { if ((value ?? '').trim().length >= 2) setModalVisible(true); }}
            onBlur={() => setTimeout(() => setResults([]), 150)}
          />
          {searching && <ActivityIndicator style={styles.spinner} size="small" color={colors.teal} />}
        </View>
        <TouchableOpacity style={styles.searchButton} onPress={() => { Keyboard.dismiss(); setResults([]); typedRef.current = false; setModalVisible(true); }} accessibilityLabel="Search for a place">
          <Ionicons name="search" size={18} color={colors.white} />
        </TouchableOpacity>
      </View>

      {results.length > 0 && (
        <View style={styles.dropdown}>
          {results.map((place, i) => (
            <TouchableOpacity
              key={place.placeId ?? place.description}
              style={[styles.option, i === results.length - 1 && styles.optionLast]}
              onPress={() => pick(place.description)}
            >
              <Ionicons name="location-outline" size={16} color={colors.teal} />
              <Text style={styles.optionText} numberOfLines={2}>{place.description}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <LocationSearchModal
        visible={modalVisible}
        title={title}
        initialQuery={(value ?? '').trim()}
        onClose={() => setModalVisible(false)}
        onSelect={(place) => { pick(place); setModalVisible(false); }}
      />
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    inputWrap: { flex: 1, justifyContent: 'center' },
    input: { marginBottom: 0, paddingRight: 34 },
    spinner: { position: 'absolute', right: 10 },
    searchButton: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' },
    dropdown: { marginTop: 6, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' },
    option: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.divider },
    optionLast: { borderBottomWidth: 0 },
    optionText: { flex: 1, fontFamily: FONTS.regular, fontSize: 14, color: colors.textPrimary },
  });
}
