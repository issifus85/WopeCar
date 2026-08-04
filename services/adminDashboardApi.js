import supabase from './supabase';
import { getConversations } from './conversationsApi';

// Admin-only reads - covered by every table's own `<table>_admin_all` RLS
// policy (is_admin()), so these plain supabase-js calls just work for a
// role='admin' session without any service-role key or special headers.

function monthStartIso() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

/**
 * The 5 summary cards on the dashboard. Revenue is summed from paid
 * bookings' total_cost, not all bookings - an unpaid pending booking isn't
 * real revenue yet, matching the "any status -> paid, independent of
 * booking status" business rule (payment_status is the source of truth for
 * money received, not status).
 */
export async function getDashboardStats() {
  const since = monthStartIso();

  const [users, vendors, activeCars, bookingsThisMonth, revenueRows] = await Promise.all([
    supabase.from('users').select('id', { count: 'exact', head: true }),
    supabase.from('vendors').select('id', { count: 'exact', head: true }),
    supabase.from('cars').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('bookings').select('id', { count: 'exact', head: true }).gte('created_at', since),
    supabase.from('bookings').select('total_cost').eq('payment_status', 'paid').gte('created_at', since),
  ]);

  for (const r of [users, vendors, activeCars, bookingsThisMonth, revenueRows]) {
    if (r.error) throw r.error;
  }

  const revenueThisMonth = (revenueRows.data ?? []).reduce((sum, b) => sum + Number(b.total_cost || 0), 0);

  return {
    totalUsers: users.count ?? 0,
    totalVendors: vendors.count ?? 0,
    activeListings: activeCars.count ?? 0,
    bookingsThisMonth: bookingsThisMonth.count ?? 0,
    revenueThisMonth,
  };
}

/**
 * Badge counts for the 3 quick-action buttons. "Pending Approvals" combines
 * unapproved vendors and unapproved (pending) car listings - both are
 * "things an admin needs to review before they go live" - since Screen 2
 * has one combined button rather than two, unlike vendors.js/cars.js which
 * each get their own dedicated Pending tab.
 */
export async function getPendingCounts() {
  const [pendingVendors, pendingCars, pendingBookings, conversations] = await Promise.all([
    supabase.from('vendors').select('id', { count: 'exact', head: true }).eq('is_approved', false),
    supabase.from('cars').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    getConversations({ scope: 'all' }),
  ]);

  if (pendingVendors.error) throw pendingVendors.error;
  if (pendingCars.error) throw pendingCars.error;
  if (pendingBookings.error) throw pendingBookings.error;

  const unreadMessages = (conversations ?? []).reduce((sum, c) => sum + (c.unreadCount || 0), 0);

  return {
    pendingApprovals: (pendingVendors.count ?? 0) + (pendingCars.count ?? 0),
    pendingBookings: pendingBookings.count ?? 0,
    unreadSupportMessages: unreadMessages,
  };
}

/**
 * Last 10 actions across 3 domains, merged and sorted client-side - there's
 * no single "activity log" table, so this fetches the last 10 of each
 * (cheap, capped) and lets the UI take the true top 10 across all three
 * rather than trying to do a cross-table sort in SQL.
 */
export async function getRecentActivity() {
  const [bookings, users, vendors] = await Promise.all([
    supabase.from('bookings').select('id, booking_ref, status, created_at, cars(name)').order('created_at', { ascending: false }).limit(10),
    supabase.from('users').select('id, full_name, email, created_at').order('created_at', { ascending: false }).limit(10),
    supabase.from('vendors').select('id, business_name, is_approved, created_at').order('created_at', { ascending: false }).limit(10),
  ]);

  if (bookings.error) throw bookings.error;
  if (users.error) throw users.error;
  if (vendors.error) throw vendors.error;

  const items = [
    ...(bookings.data ?? []).map((b) => ({
      id: `booking-${b.id}`,
      type: 'booking',
      icon: 'calendar-outline',
      title: `Booking ${b.booking_ref} (${b.cars?.name ?? 'car'})`,
      subtitle: `Status: ${b.status}`,
      createdAt: b.created_at,
    })),
    ...(users.data ?? []).map((u) => ({
      id: `user-${u.id}`,
      type: 'user',
      icon: 'person-add-outline',
      title: u.full_name || u.email || 'New user',
      subtitle: 'New registration',
      createdAt: u.created_at,
    })),
    ...(vendors.data ?? []).map((v) => ({
      id: `vendor-${v.id}`,
      type: 'vendor',
      icon: 'briefcase-outline',
      title: v.business_name || 'Vendor application',
      subtitle: v.is_approved ? 'Vendor approved' : 'New vendor application',
      createdAt: v.created_at,
    })),
  ];

  return items
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 10);
}
