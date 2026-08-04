import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Modal, Pressable, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../constants/theme';
import { useAppTheme } from '../contexts/ThemeContext';
import * as conversationsApi from '../services/conversationsApi';

// Staff-only: search WopeCar users by name/email and add one to a
// conversation (e.g. a driver, for pickup/delivery updates visible to the
// client). Bottom-sheet structure mirrors components/SortModal.js.
export default function InviteParticipantModal({ visible, onClose, conversationId, onInvited }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [invitingId, setInvitingId] = useState(null);

  useEffect(() => {
    if (!visible) {
      setQuery('');
      setResults([]);
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => {
      setIsSearching(true);
      conversationsApi.searchParticipantCandidates(conversationId, query)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setIsSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query, visible, conversationId]);

  const handleInvite = (candidate) => {
    setInvitingId(candidate.id);
    conversationsApi.inviteParticipant(conversationId, candidate.id)
      .then(() => {
        setResults((prev) => prev.filter((c) => c.id !== candidate.id));
        onInvited?.();
      })
      .catch(() => {})
      .finally(() => setInvitingId(null));
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoider}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Invite to Conversation</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name or email..."
            placeholderTextColor={colors.textSubtle}
            autoFocus
          />

          {isSearching ? (
            <ActivityIndicator style={styles.loader} color={colors.teal} />
          ) : results.length === 0 ? (
            <Text style={styles.emptyText}>{query ? 'No matching users.' : 'Start typing to search.'}</Text>
          ) : (
            <ScrollView style={styles.resultsList} showsVerticalScrollIndicator={false}>
              {results.map((candidate) => (
                <TouchableOpacity
                  key={candidate.id}
                  style={styles.optionRow}
                  onPress={() => handleInvite(candidate)}
                  disabled={invitingId === candidate.id}
                >
                  <View style={styles.optionTextWrap}>
                    <Text style={styles.optionText} numberOfLines={1}>{candidate.name}</Text>
                    <Text style={styles.optionSubtext} numberOfLines={1}>{candidate.email}</Text>
                  </View>
                  {invitingId === candidate.id ? (
                    <ActivityIndicator size="small" color={colors.teal} />
                  ) : (
                    <Ionicons name="add-circle-outline" size={22} color={colors.teal} />
                  )}
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
      justifyContent: 'space-between',
      paddingVertical: 12,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
      gap: 10,
    },
    optionTextWrap: {
      flex: 1,
    },
    optionText: {
      fontFamily: FONTS.semiBold,
      fontSize: 14,
      color: colors.textPrimary,
    },
    optionSubtext: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textSubtle,
      marginTop: 1,
    },
  });
}
