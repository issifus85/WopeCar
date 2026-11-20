import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  StyleSheet, Text, View, TextInput, TouchableOpacity, FlatList, RefreshControl, ActivityIndicator, Modal, Alert,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import FilterTabs from '../../components/admin/FilterTabs';
import BadgeStatus from '../../components/admin/BadgeStatus';
import { listUsers } from '../../services/adminUsersApi';
import { listFleetOfficers, upsertFleetOfficer, setFleetOfficerActive } from '../../services/adminFleetOfficersApi';

const SEARCH_DEBOUNCE_MS = 350;

/**
 * Admin > Fleet Officers (preprod only for now). Add an existing account as an officer, edit the name renters see and the vehicle
 * note, deactivate / reactivate. The account keeps its normal renter / vendor access; a deactivated officer can't be assigned and
 * loses the officer area on their next launch.
 */
export default function AdminFleetOfficersScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const handleBack = useCallback(() => {
    router.replace('/admin');
  }, [router]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <TouchableOpacity onPress={handleBack} hitSlop={10} style={styles.headerBackButton}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          <Text style={styles.headerBackLabel}>Back</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, handleBack, styles, colors]);

  const [officers, setOfficers] = useState([]);
  const [filter, setFilter] = useState('active');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // officer row being edited
  const [isAdding, setIsAdding] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setOfficers(await listFleetOfficers());
    } catch (e) {
      setError(e.message || 'Could not load fleet officers.');
    }
  }, []);

  useEffect(() => {
    load().finally(() => setIsLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  }, [load]);

  const counts = useMemo(() => ({
    active: officers.filter((o) => o.is_active).length,
    inactive: officers.filter((o) => !o.is_active).length,
  }), [officers]);

  const visible = useMemo(
    () => officers.filter((o) => (filter === 'active' ? o.is_active : !o.is_active)),
    [officers, filter]
  );

  const toggleActive = useCallback((officer) => {
    const deactivate = officer.is_active;
    Alert.alert(
      deactivate ? 'Deactivate officer?' : 'Reactivate officer?',
      deactivate
        ? `${officer.display_name} will no longer be assignable and loses the officer area on their next launch. Trips they have accepted but not started go back to "Needs officer". Their normal account is not affected.`
        : `${officer.display_name} can be assigned trips again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: deactivate ? 'Deactivate' : 'Reactivate',
          style: deactivate ? 'destructive' : 'default',
          onPress: async () => {
            try {
              await setFleetOfficerActive(officer.user_id, !deactivate);
              await load();
            } catch (e) {
              Alert.alert('Could not update officer', e.message || 'Please try again.');
            }
          },
        },
      ]
    );
  }, [load]);

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.title}>Fleet Officers</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => setIsAdding(true)}>
          <Ionicons name="add" size={18} color={colors.white} />
          <Text style={styles.addButtonText}>Add officer</Text>
        </TouchableOpacity>
      </View>

      <FilterTabs
        tabs={[
          { key: 'active', label: 'Active', count: counts.active },
          { key: 'inactive', label: 'Deactivated', count: counts.inactive },
        ]}
        activeKey={filter}
        onChange={setFilter}
      />

      {!!error && <Text style={styles.errorText}>{error}</Text>}

      {isLoading ? (
        <ActivityIndicator size="large" color={colors.teal} style={styles.loading} />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => item.user_id}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{(item.display_name || '?').charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.rowInfo}>
                <Text style={styles.rowName} numberOfLines={1}>{item.display_name}</Text>
                <Text style={styles.rowSubtext} numberOfLines={1}>{item.email}</Text>
                {!!item.phone && <Text style={styles.rowSubtext} numberOfLines={1}>{item.phone}</Text>}
                {!!item.vehicle_note && <Text style={styles.rowSubtext} numberOfLines={1}>{item.vehicle_note}</Text>}
                <View style={styles.badgeRow}>
                  <BadgeStatus label={item.is_active ? 'Active' : 'Deactivated'} tone={item.is_active ? 'success' : 'error'} />
                  <BadgeStatus label={`Account: ${item.user_role}`} tone="neutral" />
                  {Number(item.open_tasks) > 0 && <BadgeStatus label={`${item.open_tasks} open trip${Number(item.open_tasks) === 1 ? '' : 's'}`} tone="warning" />}
                </View>
              </View>
              <View style={styles.rowActions}>
                <TouchableOpacity onPress={() => setEditing(item)} hitSlop={8}>
                  <Ionicons name="create-outline" size={20} color={colors.textPrimary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => toggleActive(item)} hitSlop={8}>
                  <Ionicons name={item.is_active ? 'pause-circle-outline' : 'play-circle-outline'} size={22} color={item.is_active ? colors.error : colors.success} />
                </TouchableOpacity>
              </View>
            </View>
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.teal} />}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {filter === 'active' ? 'No active fleet officers yet. Tap "Add officer" to make an existing account an officer.' : 'No deactivated officers.'}
            </Text>
          }
        />
      )}

      <AddOfficerModal
        visible={isAdding}
        existingIds={officers.map((o) => o.user_id)}
        onClose={() => setIsAdding(false)}
        onAdded={async () => { setIsAdding(false); await load(); }}
        styles={styles}
        colors={colors}
      />
      <EditOfficerModal
        officer={editing}
        onClose={() => setEditing(null)}
        onSaved={async () => { setEditing(null); await load(); }}
        styles={styles}
        colors={colors}
      />
    </View>
  );
}

function AddOfficerModal({ visible, existingIds, onClose, onAdded, styles, colors }) {
  const [searchInput, setSearchInput] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [savingId, setSavingId] = useState(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (!visible) { setSearchInput(''); setResults([]); }
  }, [visible]);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    const term = searchInput.trim();
    if (term.length < 2) { setResults([]); return undefined; }
    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const { users } = await listUsers({ search: term });
        setResults(users.slice(0, 20));
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(debounceRef.current);
  }, [searchInput]);

  const add = async (user) => {
    setSavingId(user.id);
    try {
      await upsertFleetOfficer({ userId: user.id });
      await onAdded();
    } catch (e) {
      Alert.alert('Could not add officer', e.message || 'Please try again.');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Add fleet officer</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
          <Text style={styles.modalHint}>Find the person's existing WopeCar account. They keep their normal renter or vendor access.</Text>
          <View style={styles.searchWrap}>
            <Ionicons name="search" size={18} color={colors.textSubtle} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by name or email..."
              placeholderTextColor={colors.textSubtle}
              value={searchInput}
              onChangeText={setSearchInput}
              autoCapitalize="none"
              autoFocus
            />
          </View>
          {isSearching && <ActivityIndicator color={colors.teal} style={styles.footerLoading} />}
          <FlatList
            data={results}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            style={styles.resultsList}
            renderItem={({ item }) => {
              const already = existingIds.includes(item.id);
              const blocked = already || item.role === 'suspended';
              return (
                <View style={styles.resultRow}>
                  <View style={styles.rowInfo}>
                    <Text style={styles.rowName} numberOfLines={1}>{item.full_name || 'Unnamed User'}</Text>
                    <Text style={styles.rowSubtext} numberOfLines={1}>{item.email} · {item.role}</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.smallButton, blocked && styles.smallButtonDisabled]}
                    disabled={blocked || savingId === item.id}
                    onPress={() => add(item)}
                  >
                    {savingId === item.id
                      ? <ActivityIndicator color={colors.white} size="small" />
                      : <Text style={styles.smallButtonText}>{already ? 'Officer' : item.role === 'suspended' ? 'Suspended' : 'Add'}</Text>}
                  </TouchableOpacity>
                </View>
              );
            }}
            ListEmptyComponent={
              searchInput.trim().length >= 2 && !isSearching ? <Text style={styles.emptyText}>No accounts found.</Text> : null
            }
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function EditOfficerModal({ officer, onClose, onSaved, styles, colors }) {
  const [displayName, setDisplayName] = useState('');
  const [vehicleNote, setVehicleNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (officer) {
      setDisplayName(officer.display_name || '');
      setVehicleNote(officer.vehicle_note || '');
    }
  }, [officer]);

  const save = async () => {
    if (!displayName.trim()) {
      Alert.alert('Name required', 'Enter the name renters will see.');
      return;
    }
    setIsSaving(true);
    try {
      await upsertFleetOfficer({ userId: officer.user_id, displayName: displayName.trim(), vehicleNote: vehicleNote.trim() });
      await onSaved();
    } catch (e) {
      Alert.alert('Could not save', e.message || 'Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal visible={!!officer} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Edit officer</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
          <Text style={styles.fieldLabel}>Name renters see</Text>
          <TextInput style={styles.input} value={displayName} onChangeText={setDisplayName} placeholderTextColor={colors.textSubtle} />
          <Text style={styles.fieldLabel}>Vehicle note (optional)</Text>
          <TextInput
            style={styles.input}
            value={vehicleNote}
            onChangeText={setVehicleNote}
            placeholder="e.g. Rides a motorbike to the handover"
            placeholderTextColor={colors.textSubtle}
          />
          <TouchableOpacity style={styles.saveButton} onPress={save} disabled={isSaving}>
            {isSaving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.saveButtonText}>Save</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    headerBackButton: { flexDirection: 'row', alignItems: 'center', paddingRight: 8 },
    headerBackLabel: { fontFamily: FONTS.regular, fontSize: 17, color: colors.textPrimary, marginLeft: -4 },
    container: { flex: 1, backgroundColor: colors.background },
    topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
    title: { fontFamily: FONTS.bold, fontSize: 20, color: colors.textPrimary },
    addButton: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.teal, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
    addButtonText: { fontFamily: FONTS.semiBold, fontSize: 13, color: colors.white },
    errorText: { fontFamily: FONTS.regular, fontSize: 13, color: colors.error, paddingHorizontal: 16, paddingVertical: 8 },
    loading: { marginTop: 40 },
    list: { paddingHorizontal: 16, paddingBottom: 140, paddingTop: 8 },
    row: {
      flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, backgroundColor: colors.surface, borderRadius: 12, marginBottom: 10,
      shadowColor: colors.shadow, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
    },
    avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.highlight, alignItems: 'center', justifyContent: 'center' },
    avatarText: { fontFamily: FONTS.bold, fontSize: 16, color: colors.textPrimary },
    rowInfo: { flex: 1, gap: 2 },
    rowName: { fontFamily: FONTS.semiBold, fontSize: 15, color: colors.textPrimary },
    rowSubtext: { fontFamily: FONTS.regular, fontSize: 12, color: colors.textSubtle },
    badgeRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 4 },
    rowActions: { gap: 14, alignItems: 'center' },
    emptyText: { fontFamily: FONTS.regular, fontSize: 14, color: colors.textSubtle, textAlign: 'center', marginTop: 40, paddingHorizontal: 24 },
    footerLoading: { marginVertical: 12 },
    modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
    modalSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, paddingBottom: 32, maxHeight: '85%' },
    modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    modalTitle: { fontFamily: FONTS.bold, fontSize: 18, color: colors.textPrimary },
    modalHint: { fontFamily: FONTS.regular, fontSize: 13, color: colors.textSubtle, marginBottom: 12 },
    searchWrap: {
      flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.background, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    },
    searchInput: { flex: 1, fontFamily: FONTS.regular, fontSize: 15, color: colors.textPrimary, padding: 0 },
    resultsList: { marginTop: 8 },
    resultRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.divider },
    smallButton: { backgroundColor: colors.teal, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, minWidth: 64, alignItems: 'center' },
    smallButtonDisabled: { backgroundColor: colors.disabled },
    smallButtonText: { fontFamily: FONTS.semiBold, fontSize: 13, color: colors.white },
    fieldLabel: { fontFamily: FONTS.semiBold, fontSize: 13, color: colors.textPrimary, marginTop: 12, marginBottom: 6 },
    input: {
      fontFamily: FONTS.regular, fontSize: 15, color: colors.textPrimary, backgroundColor: colors.background, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    },
    saveButton: { backgroundColor: colors.teal, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
    saveButtonText: { fontFamily: FONTS.semiBold, fontSize: 15, color: colors.white },
  });
}
