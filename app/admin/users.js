import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, FlatList, RefreshControl, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import FilterTabs from '../../components/admin/FilterTabs';
import BadgeStatus from '../../components/admin/BadgeStatus';
import UserDetailModal from '../../components/admin/UserDetailModal';
import { listUsers, getUserRoleCounts } from '../../services/adminUsersApi';

const ROLE_TONE = { admin: 'success', vendor: 'warning', renter: 'neutral', suspended: 'error' };
const SEARCH_DEBOUNCE_MS = 350;

function UserRow({ user, onPress, styles, colors }) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{(user.full_name || user.email || '?').charAt(0).toUpperCase()}</Text>
      </View>
      <View style={styles.rowInfo}>
        <Text style={styles.rowName} numberOfLines={1}>{user.full_name || 'Unnamed User'}</Text>
        <Text style={styles.rowSubtext} numberOfLines={1}>{user.email}</Text>
        {!!user.phone && <Text style={styles.rowSubtext} numberOfLines={1}>{user.phone}</Text>}
        <View style={styles.badgeRow}>
          <BadgeStatus label={user.role} tone={ROLE_TONE[user.role] || 'neutral'} />
          {user.is_verified && <BadgeStatus label="Verified" tone="success" />}
          <Text style={styles.joinedText}>Joined {new Date(user.created_at).toLocaleDateString()}</Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
    </TouchableOpacity>
  );
}

export default function AdminUsersScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Custom headerLeft, not the default native-stack back button - this
  // screen is pushed from inside admin/(tabs) to a Stack.Screen registered
  // as that tabs group's sibling in admin/_layout.js, the same combination
  // that leaves the default back button's bare GO_BACK action unresolved
  // elsewhere in this app (see app/booking/[id].js's handleBack and
  // app/inbox/index.js's matching fix - canGoBack() isn't a safe guard
  // either, it reports true even in the broken state).
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

  const [filter, setFilter] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [counts, setCounts] = useState({ all: 0, renter: 0, vendor: 0, admin: 0 });
  const [users, setUsers] = useState([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [selectedUserId, setSelectedUserId] = useState(null);

  const debounceRef = useRef(null);
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearch(searchInput), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(debounceRef.current);
  }, [searchInput]);

  const loadPage = useCallback(async (pageToLoad, { append }) => {
    const result = await listUsers({ filter, search, page: pageToLoad });
    setUsers((prev) => (append ? [...prev, ...result.users] : result.users));
    setHasMore(result.hasMore);
    setPage(pageToLoad);
  }, [filter, search]);

  const refreshAll = useCallback(async () => {
    setError(null);
    try {
      await Promise.all([loadPage(0, { append: false }), getUserRoleCounts().then(setCounts)]);
    } catch (e) {
      setError(e.message || 'Could not load users.');
    }
  }, [loadPage]);

  useEffect(() => {
    setIsLoading(true);
    refreshAll().finally(() => setIsLoading(false));
  }, [refreshAll]);

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await refreshAll();
    setIsRefreshing(false);
  }, [refreshAll]);

  const onEndReached = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    try {
      await loadPage(page + 1, { append: true });
    } catch (e) {
      setError(e.message || 'Could not load more users.');
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, hasMore, page, loadPage]);

  const tabs = [
    { key: 'all', label: 'All', count: counts.all },
    { key: 'renter', label: 'Renters', count: counts.renter },
    { key: 'vendor', label: 'Vendors', count: counts.vendor },
    { key: 'admin', label: 'Admins', count: counts.admin },
  ];

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={colors.textSubtle} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or email..."
          placeholderTextColor={colors.textSubtle}
          value={searchInput}
          onChangeText={setSearchInput}
          autoCapitalize="none"
        />
      </View>

      <FilterTabs tabs={tabs} activeKey={filter} onChange={setFilter} />

      {!!error && <Text style={styles.errorText}>{error}</Text>}

      {isLoading ? (
        <ActivityIndicator size="large" color={colors.teal} style={styles.loading} />
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <UserRow user={item} onPress={() => setSelectedUserId(item.id)} styles={styles} colors={colors} />
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.teal} />}
          onEndReachedThreshold={0.4}
          onEndReached={onEndReached}
          ListEmptyComponent={<Text style={styles.emptyText}>No users found.</Text>}
          ListFooterComponent={isLoadingMore ? <ActivityIndicator color={colors.teal} style={styles.footerLoading} /> : null}
        />
      )}
      </KeyboardAvoidingView>

      <UserDetailModal
        visible={!!selectedUserId}
        userId={selectedUserId}
        onClose={() => setSelectedUserId(null)}
        onChanged={refreshAll}
      />
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    headerBackButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingRight: 8,
    },
    headerBackLabel: {
      fontFamily: FONTS.regular,
      fontSize: 17,
      color: colors.textPrimary,
      marginLeft: -4,
    },
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    flex: {
      flex: 1,
    },
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginHorizontal: 16,
      marginTop: 16,
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: colors.surface,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    searchInput: {
      flex: 1,
      fontFamily: FONTS.regular,
      fontSize: 14,
      color: colors.textPrimary,
    },
    errorText: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.error,
      textAlign: 'center',
      marginTop: 12,
    },
    loading: {
      marginTop: 40,
    },
    footerLoading: {
      marginVertical: 16,
    },
    list: {
      paddingHorizontal: 16,
      paddingBottom: 24,
    },
    emptyText: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textSubtle,
      textAlign: 'center',
      marginTop: 40,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 12,
      backgroundColor: colors.surface,
      borderRadius: 12,
      marginBottom: 10,
      shadowColor: colors.shadow,
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 2,
    },
    avatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.highlight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: {
      fontFamily: FONTS.bold,
      fontSize: 16,
      color: colors.teal,
    },
    rowInfo: {
      flex: 1,
      gap: 2,
    },
    rowName: {
      fontFamily: FONTS.semiBold,
      fontSize: 14,
      color: colors.textPrimary,
    },
    rowSubtext: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textSubtle,
    },
    badgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 4,
      flexWrap: 'wrap',
    },
    joinedText: {
      fontFamily: FONTS.regular,
      fontSize: 10,
      color: colors.textSubtle,
    },
  });
}
