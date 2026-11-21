import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, Alert, Modal, Pressable, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import SectionHeading from '../SectionHeading';
import BadgeStatus from './BadgeStatus';
import { TRIP_STATUS_LABELS, TRIP_STATUS_TONES, tripTypeLabel, formatTripTime } from '../../constants/fleetOfficer';
import { listTripTasks, assignTripTask, ensureTripTasks, listFleetOfficers } from '../../services/adminFleetOfficersApi';

/**
 * Admin > booking: the booking's delivery and collection trips, and who drives them. Assigning adds the officer to the booking chat and
 * pushes them the trip; unassigning or reassigning takes them back out (all in admin_assign_trip_task). Trips are made automatically when a
 * booking is confirmed; "Create trips" covers bookings confirmed before that existed.
 */
export default function FleetOfficerSection({ bookingId, bookingStatus }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [tasks, setTasks] = useState(undefined);
  const [officers, setOfficers] = useState([]);
  const [picking, setPicking] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    try {
      const [t, o] = await Promise.all([listTripTasks({ bookingId }), listFleetOfficers()]);
      setTasks(t);
      setOfficers(o.filter((x) => x.is_active));
    } catch {
      setTasks((prev) => prev ?? []);
    }
  }, [bookingId]);

  useFocusEffect(useCallback(() => {
    if (bookingId) load();
  }, [bookingId, load]));

  if (!bookingId) return null;

  const status = String(bookingStatus || '').toLowerCase();

  const assign = async (task, officerId) => {
    setPicking(null);
    setBusyId(task.id);
    try {
      await assignTripTask(task.id, officerId);
      await load();
    } catch (e) {
      Alert.alert('Could not update the trip', e?.message || 'Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const createTrips = async () => {
    setBusyId('create');
    try {
      await ensureTripTasks(bookingId);
      await load();
    } catch (e) {
      Alert.alert('Could not create the trips', e?.message || 'Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  // A booking has at most one delivery and one collection; cancelled ones stay visible so the history is clear.
  const openTasks = tasks || [];

  return (
    <View style={styles.section}>
      <SectionHeading>Fleet Officer</SectionHeading>
      {tasks === undefined ? (
        <ActivityIndicator color={colors.teal} style={{ marginVertical: 8 }} />
      ) : openTasks.length === 0 ? (
        <View style={{ gap: 8 }}>
          <Text style={styles.muted}>
            {status === 'confirmed' ? 'No delivery or return pickup trips yet.' : 'Trips are created when the booking is confirmed.'}
          </Text>
          {status === 'confirmed' && (
            <TouchableOpacity style={styles.button} onPress={createTrips} disabled={busyId === 'create'}>
              {busyId === 'create' ? <ActivityIndicator color={colors.white} /> : <Text style={styles.buttonText}>Create trips</Text>}
            </TouchableOpacity>
          )}
        </View>
      ) : (
        openTasks.map((task) => {
          const locked = ['completed', 'cancelled'].includes(task.status);
          return (
            <View key={task.id} style={styles.task}>
              <View style={styles.taskTop}>
                <Text style={styles.taskType}>{tripTypeLabel(task.type, task.drive_type)}</Text>
                <BadgeStatus label={TRIP_STATUS_LABELS[task.status] || task.status} tone={TRIP_STATUS_TONES[task.status]} />
              </View>
              <Text style={styles.muted}>{formatTripTime(task.scheduled_at)}</Text>
              {!!(task.type === 'delivery' ? task.to_address : task.from_address) && (
                <Text style={styles.muted} numberOfLines={2}>
                  {task.type === 'delivery' ? `To ${task.to_address}` : `From ${task.from_address}`}
                </Text>
              )}
              <TouchableOpacity style={styles.officerRow} disabled={locked || busyId === task.id} onPress={() => setPicking(task)}>
                <Ionicons name="person-circle-outline" size={20} color={task.officer_id ? colors.teal : colors.error} />
                <Text style={[styles.officerName, !task.officer_id && { color: colors.error }]}>
                  {task.officer_name || 'Needs officer'}
                </Text>
                {busyId === task.id ? <ActivityIndicator size="small" color={colors.teal} /> : !locked && (
                  <Text style={styles.link}>{task.officer_id ? 'Change' : 'Assign'}</Text>
                )}
              </TouchableOpacity>
            </View>
          );
        })
      )}

      <Modal visible={!!picking} transparent animationType="fade" onRequestClose={() => setPicking(null)}>
        <Pressable style={styles.backdrop} onPress={() => setPicking(null)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Choose an officer</Text>
              <TouchableOpacity onPress={() => setPicking(null)} hitSlop={10}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 360 }}>
              {officers.length === 0 && <Text style={[styles.muted, { padding: 16 }]}>No active officers. Add one in Menu &gt; Fleet Officers.</Text>}
              {officers.map((o) => {
                const selected = picking?.officer_id === o.user_id;
                return (
                  <TouchableOpacity key={o.user_id} style={styles.option} onPress={() => assign(picking, o.user_id)} disabled={selected}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.optionText, selected && { color: colors.teal }]}>{o.display_name}</Text>
                      <Text style={styles.muted}>{Number(o.open_tasks || 0)} open trip{Number(o.open_tasks) === 1 ? '' : 's'}</Text>
                    </View>
                    {selected && <Ionicons name="checkmark" size={20} color={colors.teal} />}
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
    section: { backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginTop: 14, gap: 10 },
    muted: { fontFamily: FONTS.regular, fontSize: 13, color: colors.textSubtle },
    task: { borderWidth: 1, borderColor: colors.divider, borderRadius: 10, padding: 12, gap: 4 },
    taskTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    taskType: { fontFamily: FONTS.semiBold, fontSize: 15, color: colors.textPrimary },
    officerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
    officerName: { flex: 1, fontFamily: FONTS.medium, fontSize: 14, color: colors.textPrimary },
    link: { fontFamily: FONTS.semiBold, fontSize: 14, color: colors.teal },
    button: { backgroundColor: colors.teal, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
    buttonText: { fontFamily: FONTS.semiBold, fontSize: 15, color: colors.white },
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 32 },
    sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.divider },
    sheetTitle: { fontFamily: FONTS.semiBold, fontSize: 17, color: colors.textPrimary },
    option: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.divider },
    optionText: { fontFamily: FONTS.medium, fontSize: 15, color: colors.textPrimary },
  });
}
