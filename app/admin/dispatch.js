import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, FlatList, RefreshControl, ActivityIndicator, Modal, Pressable, ScrollView, Alert,
} from 'react-native';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import FilterTabs from '../../components/admin/FilterTabs';
import DispatchMap from '../../components/admin/DispatchMap';
import { TRIP_STATUS_LABELS, formatTripTime, tripTypeLabel } from '../../constants/fleetOfficer';
import { accraDay, getDispatchBoard, getOfficerAvailability, subscribeToTripChanges } from '../../services/adminDispatchApi';
import { assignTripTask } from '../../services/adminFleetOfficersApi';
import { formatEta } from '../../utils/polyline';

const STATUS_TABS = [
  { key: 'all', label: 'All' },
  { key: 'late', label: 'Late' },
  { key: 'unassigned', label: 'Needs officer' },
  { key: 'assigned', label: 'Assigned' },
  { key: 'live', label: 'On the way' },
  { key: 'completed', label: 'Completed' },
];

const CHIP = {
  unassigned: ['#fdecea', '#c0392b'],
  assigned: ['#fff6e0', '#9a6b00'],
  accepted: ['#fff6e0', '#9a6b00'],
  en_route: ['#e3f6f4', '#0f7d73'],
  arrived: ['#e6f5ec', '#1a7a4c'],
  inspecting: ['#e6f5ec', '#1a7a4c'],
  completed: ['#eef0f3', '#5b6472'],
  cancelled: ['#eef0f3', '#8a94a6'],
};

const AVAILABILITY = { on_trip: ['On a trip', '#0f9b8e'], available: ['Available', '#1a8f5a'], off: ['Off', '#8a94a6'] };
const LIVE_COLUMNS = ['last_lat', 'last_lng', 'last_location_at', 'eta_seconds', 'eta_distance_m', 'route_polyline', 'dest_lat', 'dest_lng'];

function matches(task, tab) {
  if (tab === 'all') return true;
  if (tab === 'late') return task.is_late;
  if (tab === 'assigned') return task.status === 'assigned' || task.status === 'accepted';
  if (tab === 'live') return ['en_route', 'arrived', 'inspecting'].includes(task.status);
  return task.status === tab;
}

function paperworkText(t) {
  const mark = (s) => (s === 'submitted' ? 'done' : s === 'draft' ? 'started' : 'not started');
  return t.type === 'delivery'
    ? `Pre-inspection ${mark(t.pre_inspection_status)} · Agreement ${mark(t.agreement_status)}`
    : `Post-inspection ${mark(t.post_inspection_status)}`;
}

/**
 * Admin > Dispatch (Fleet Officer Phase 5, preprod only). Today's deliveries and return pickups, who is on them and where the active
 * officers are. Updates live. Tap a trip for assign / chat / booking; inspections and agreements open from the booking screen.
 */
export default function AdminDispatchScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <TouchableOpacity onPress={() => router.replace('/admin')} hitSlop={10} style={styles.headerBackButton}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          <Text style={styles.headerBackLabel}>Back</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, router, styles, colors]);

  const [dayOffset, setDayOffset] = useState(0);
  const day = accraDay(dayOffset);
  const [tasks, setTasks] = useState(null);
  const [officers, setOfficers] = useState([]);
  const [tab, setTab] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const [picking, setPicking] = useState(null); // task being (re)assigned
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [focused, setFocused] = useState(false);
  const reloadTimer = useRef(null);

  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => setFocused(false);
  }, []));

  const load = useCallback(async () => {
    try {
      const [t, o] = await Promise.all([getDispatchBoard(day), getOfficerAvailability(day)]);
      setTasks(t);
      setOfficers(o);
      setError(null);
    } catch (e) {
      setTasks((prev) => prev ?? []);
      setError(e.message || 'Could not load the board.');
    }
  }, [day]);

  useEffect(() => {
    if (!focused) return undefined;
    load();
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, [focused, load]);

  useEffect(() => {
    if (!focused) return undefined;
    return subscribeToTripChanges((row, event) => {
      let reload = event !== 'UPDATE';
      setTasks((prev) => {
        if (!prev) return prev;
        const i = prev.findIndex((t) => t.id === row.id);
        if (i < 0) {
          reload = true;
          return prev;
        }
        const cur = prev[i];
        if ((row.status && row.status !== cur.status) || ('officer_id' in row && row.officer_id !== cur.officer_id)) reload = true;
        const merged = { ...cur };
        LIVE_COLUMNS.forEach((k) => { if (k in row) merged[k] = row[k]; });
        const next = prev.slice();
        next[i] = merged;
        return next;
      });
      setOfficers((prev) => prev.map((o) => (o.current_task_id === row.id && row.last_lat != null
        ? { ...o, last_lat: row.last_lat, last_lng: row.last_lng, last_location_at: row.last_location_at }
        : o)));
      if (reload) {
        clearTimeout(reloadTimer.current);
        reloadTimer.current = setTimeout(load, 800);
      }
    });
  }, [focused, load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const counts = useMemo(() => {
    const c = {};
    STATUS_TABS.forEach((t) => { c[t.key] = (tasks ?? []).filter((x) => matches(x, t.key)).length; });
    return c;
  }, [tasks]);
  const visible = useMemo(() => (tasks ?? []).filter((t) => matches(t, tab)), [tasks, tab]);
  const selected = useMemo(() => (tasks ?? []).find((t) => t.id === selectedId) ?? null, [tasks, selectedId]);
  const activeOfficers = officers.filter((o) => o.is_active);

  const assign = async (task, officerId) => {
    setPicking(null);
    try {
      await assignTripTask(task.id, officerId);
      await load();
    } catch (e) {
      Alert.alert('Could not update the trip', e.message || 'Please try again.');
    }
  };

  const header = (
    <View>
      <View style={styles.topBar}>
        <Text style={styles.title}>Dispatch</Text>
        <View style={styles.dayToggle}>
          {[['Today', 0], ['Tomorrow', 1]].map(([label, off]) => (
            <TouchableOpacity key={label} style={[styles.dayChip, dayOffset === off && styles.dayChipActive]} onPress={() => { setTasks(null); setDayOffset(off); }}>
              <Text style={[styles.dayChipText, dayOffset === off && styles.dayChipTextActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.mapWrap}>
        <DispatchMap officers={officers} selected={selected} onSelectTask={setSelectedId} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.officerStrip}>
        {officers.length === 0 && <Text style={styles.muted}>No fleet officers yet.</Text>}
        {officers.map((o) => {
          const [label, color] = AVAILABILITY[o.availability] ?? AVAILABILITY.off;
          return (
            <TouchableOpacity key={o.user_id} style={styles.officerChip} onPress={() => o.current_task_id && setSelectedId(o.current_task_id)} disabled={!o.current_task_id}>
              <View style={[styles.dot, { backgroundColor: color }]} />
              <Text style={styles.officerName} numberOfLines={1}>{o.display_name}</Text>
              <Text style={[styles.officerState, { color }]}>{label}{o.availability !== 'off' ? ` · ${o.trips_today}` : ''}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <FilterTabs tabs={STATUS_TABS.map((t) => ({ ...t, count: counts[t.key] }))} activeKey={tab} onChange={setTab} />
      {!!error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );

  return (
    <View style={styles.container}>
      {tasks === null ? (
        <>
          {header}
          <ActivityIndicator size="large" color={colors.teal} style={{ marginTop: 32 }} />
        </>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(t) => t.id}
          ListHeaderComponent={header}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.teal} />}
          ListEmptyComponent={<Text style={styles.emptyText}>No trips here. Try another filter or day.</Text>}
          renderItem={({ item: t }) => {
            const [bg, fg] = CHIP[t.status] ?? CHIP.completed;
            const isSel = t.id === selectedId;
            const eta = t.status === 'en_route' ? formatEta(t.eta_seconds) : null;
            const open = !['completed', 'cancelled'].includes(t.status);
            return (
              <TouchableOpacity style={[styles.row, isSel && styles.rowSelected]} onPress={() => setSelectedId(isSel ? null : t.id)} activeOpacity={0.8}>
                <View style={styles.rowHead}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{tripTypeLabel(t.type, t.drive_type)} · {t.booking_ref ?? 'WopeDriver'}</Text>
                  <View style={[styles.chip, { backgroundColor: bg }]}><Text style={[styles.chipText, { color: fg }]}>{TRIP_STATUS_LABELS[t.status] ?? t.status}</Text></View>
                </View>
                <Text style={styles.rowSub}>
                  {formatTripTime(t.scheduled_at)}
                  {t.is_late ? '  ' : ''}
                  {t.is_late && <Text style={styles.late}>Late</Text>}
                </Text>
                {!!t.car_name && <Text style={styles.rowSub} numberOfLines={1}>{t.car_name}</Text>}
                <Text style={styles.rowSub} numberOfLines={2}>{t.type === 'delivery' ? `To ${t.to_address ?? '—'}` : `From ${t.from_address ?? '—'}`}</Text>
                <Text style={[styles.rowSub, !t.officer_name && { color: colors.error }]}>
                  Officer: {t.officer_name ?? 'none'}{eta ? ` · ${eta} away` : ''}{t.status === 'en_route' && !t.sharing ? ' · sharing off' : ''}
                </Text>
                <Text style={styles.paperwork}>{paperworkText(t)}</Text>

                {isSel && (
                  <View style={styles.actions}>
                    {open && (
                      <TouchableOpacity style={styles.actionBtn} onPress={() => setPicking(t)}>
                        <Ionicons name="person-add-outline" size={16} color="#fff" />
                        <Text style={styles.actionText}>{t.officer_id ? 'Reassign' : 'Assign'}</Text>
                      </TouchableOpacity>
                    )}
                    {!!t.conversation_id && (
                      <TouchableOpacity style={styles.actionBtnGhost} onPress={() => router.push({ pathname: `/staff-inbox/${t.conversation_id}`, params: { from: 'support_ops' } })}>
                        <Ionicons name="chatbubbles-outline" size={16} color={COLORS.teal} />
                        <Text style={styles.actionTextGhost}>Chat</Text>
                      </TouchableOpacity>
                    )}
                    {!!t.booking_id && (
                      <TouchableOpacity style={styles.actionBtnGhost} onPress={() => router.push(`/admin/booking/${t.booking_id}`)}>
                        <Ionicons name="document-text-outline" size={16} color={COLORS.teal} />
                        <Text style={styles.actionTextGhost}>Booking & paperwork</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
        />
      )}

      <Modal visible={!!picking} transparent animationType="fade" onRequestClose={() => setPicking(null)}>
        <Pressable style={styles.backdrop} onPress={() => setPicking(null)}>
          <Pressable style={styles.sheet}>
            <Text style={styles.sheetTitle}>{picking?.officer_id ? 'Reassign trip' : 'Assign an officer'}</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {activeOfficers.length === 0 && <Text style={styles.muted}>No active officers. Add one in Menu &gt; Fleet Officers.</Text>}
              {activeOfficers.map((o) => {
                const [label, color] = AVAILABILITY[o.availability];
                const current = picking?.officer_id === o.user_id;
                return (
                  <TouchableOpacity key={o.user_id} style={styles.option} onPress={() => assign(picking, o.user_id)} disabled={current}>
                    <Text style={[styles.optionText, current && { color: colors.textSubtle }]}>{o.display_name}{current ? ' (current)' : ''}</Text>
                    <Text style={[styles.optionSub, { color }]}>{label} · {o.trips_today} today</Text>
                  </TouchableOpacity>
                );
              })}
              {!!picking?.officer_id && (
                <TouchableOpacity style={styles.option} onPress={() => assign(picking, null)}>
                  <Text style={[styles.optionText, { color: colors.error }]}>Unassign</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    headerBackButton: { flexDirection: 'row', alignItems: 'center', paddingRight: 8 },
    headerBackLabel: { fontFamily: FONTS.regular, fontSize: 17, color: colors.textPrimary, marginLeft: -4 },
    container: { flex: 1, backgroundColor: colors.background },
    topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
    title: { fontFamily: FONTS.bold, fontSize: 20, color: colors.textPrimary },
    dayToggle: { flexDirection: 'row', gap: 6 },
    dayChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    dayChipActive: { backgroundColor: colors.teal, borderColor: colors.teal },
    dayChipText: { fontFamily: FONTS.semiBold, fontSize: 12, color: colors.textPrimary },
    dayChipTextActive: { color: colors.white },
    mapWrap: { paddingHorizontal: 16, paddingBottom: 8 },
    officerStrip: { paddingHorizontal: 16, gap: 8, paddingBottom: 8 },
    officerChip: { backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, minWidth: 110, maxWidth: 160 },
    dot: { width: 8, height: 8, borderRadius: 4, marginBottom: 4 },
    officerName: { fontFamily: FONTS.semiBold, fontSize: 13, color: colors.textPrimary },
    officerState: { fontFamily: FONTS.medium, fontSize: 11 },
    errorText: { fontFamily: FONTS.regular, fontSize: 13, color: colors.error, paddingHorizontal: 16, paddingVertical: 8 },
    list: { paddingBottom: 140 },
    emptyText: { fontFamily: FONTS.regular, fontSize: 14, color: colors.textSubtle, textAlign: 'center', marginTop: 32, paddingHorizontal: 24 },
    muted: { fontFamily: FONTS.regular, fontSize: 13, color: colors.textSubtle, padding: 8 },
    row: {
      marginHorizontal: 16, marginTop: 10, padding: 12, backgroundColor: colors.surface, borderRadius: 12, gap: 3,
      shadowColor: colors.shadow, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2, borderWidth: 1, borderColor: 'transparent',
    },
    rowSelected: { borderColor: colors.teal },
    rowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    rowTitle: { flex: 1, fontFamily: FONTS.semiBold, fontSize: 15, color: colors.textPrimary },
    rowSub: { fontFamily: FONTS.regular, fontSize: 13, color: colors.textBody },
    late: { fontFamily: FONTS.bold, color: colors.error },
    paperwork: { fontFamily: FONTS.regular, fontSize: 12, color: colors.textSubtle, marginTop: 2 },
    chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
    chipText: { fontFamily: FONTS.bold, fontSize: 11 },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
    actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.teal, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
    actionText: { fontFamily: FONTS.semiBold, fontSize: 13, color: '#fff' },
    actionBtnGhost: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: COLORS.teal, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
    actionTextGhost: { fontFamily: FONTS.semiBold, fontSize: 13, color: COLORS.teal },
    backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
    sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, paddingBottom: 32 },
    sheetTitle: { fontFamily: FONTS.bold, fontSize: 18, color: colors.textPrimary, marginBottom: 8 },
    option: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.divider },
    optionText: { fontFamily: FONTS.semiBold, fontSize: 15, color: colors.textPrimary },
    optionSub: { fontFamily: FONTS.medium, fontSize: 12, marginTop: 2 },
  });
}
