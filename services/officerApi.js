import supabase from './supabase';

// Fleet officer side of trip tasks (migration 0180). Every call is an RPC that checks, in the database, that the task is the
// caller's and that the status only moves forward - the app never writes trip_tasks directly.

function normalizeTask(raw) {
  return {
    id: raw.id,
    type: raw.type,
    status: raw.status,
    scheduledAt: raw.scheduled_at,
    fromAddress: raw.from_address,
    toAddress: raw.to_address,
    notes: raw.notes,
    startedAt: raw.started_at,
    arrivedAt: raw.arrived_at,
    completedAt: raw.completed_at,
    bookingId: raw.booking_id,
    driverBookingId: raw.driver_booking_id,
    bookingRef: raw.booking_ref,
    driveType: raw.drive_type,
    bookingStatus: raw.booking_status,
    startDate: raw.start_date,
    endDate: raw.end_date,
    carName: raw.car_name,
    carImage: raw.car_image,
    carTransmission: raw.car_transmission,
    customerName: raw.customer_name,
    customerPhone: raw.customer_phone,
    vendorName: raw.vendor_name,
    vendorPhone: raw.vendor_phone,
    conversationId: raw.conversation_id,
  };
}

export async function listMyTrips() {
  const { data, error } = await supabase.rpc('officer_trip_tasks');
  if (error) throw error;
  return (data ?? []).map(normalizeTask);
}

export async function getMyTrip(taskId) {
  const { data, error } = await supabase.rpc('officer_trip_tasks', { p_task_id: taskId });
  if (error) throw error;
  return data?.[0] ? normalizeTask(data[0]) : null;
}

export async function respondToTrip(taskId, accept) {
  const { error } = await supabase.rpc('officer_respond_trip_task', { p_task_id: taskId, p_accept: accept });
  if (error) throw error;
}

export async function advanceTrip(taskId, status) {
  const { error } = await supabase.rpc('officer_advance_trip_task', { p_task_id: taskId, p_status: status });
  if (error) throw error;
}

/** kind: 'on_my_way' | 'running_late' | 'arrived' - posts the message in the booking chat as the officer. */
export async function sendQuickReply(taskId, kind) {
  const { error } = await supabase.rpc('officer_quick_reply', { p_task_id: taskId, p_kind: kind });
  if (error) throw error;
}
