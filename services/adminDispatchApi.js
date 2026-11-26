import supabase from './supabase';

// Fleet Officer Phase 5: admin dispatch board (migration 0192). Admin-only RPCs; trip changes stream in through Supabase Realtime.

/** YYYY-MM-DD for today (offset days) in Accra. */
export function accraDay(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Accra' }).format(d);
}

export async function getDispatchBoard(day) {
  // Accra is GMT all year, so its day is the UTC day.
  const from = new Date(`${day}T00:00:00Z`);
  const to = new Date(from.getTime() + 86400000);
  const { data, error } = await supabase.rpc('admin_dispatch_board', { p_from: from.toISOString(), p_to: to.toISOString() });
  if (error) throw error;
  return data ?? [];
}

export async function getOfficerAvailability(day) {
  const { data, error } = await supabase.rpc('admin_officer_availability', { p_day: day });
  if (error) throw error;
  return (data ?? []).map((o) => ({ ...o, trips_today: Number(o.trips_today ?? 0) }));
}

/** Calls onChange(row, eventType) for every trip change. Returns an unsubscribe function. */
export function subscribeToTripChanges(onChange) {
  const channel = supabase
    .channel(`admin-dispatch-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_tasks' }, (payload) => {
      const row = payload?.new && Object.keys(payload.new).length ? payload.new : payload?.old;
      if (row?.id) onChange(row, payload.eventType);
    })
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
