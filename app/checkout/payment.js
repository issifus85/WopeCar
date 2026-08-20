import { useState, useEffect, useMemo } from 'react';
import { StyleSheet, Text, View, ActivityIndicator, ScrollView, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import {
  formatCurrency,
  calculateRentalPricing,
  calculateSecurityDeposit,
  getSelfDriveDeliveryFee,
  WOPECARE_PLANS,
  calculateWopeCareCost,
  calculateWopeCareDailyRate,
} from '../../constants/pricing';
import { fetchCarById } from '../../services/carsApi';
import { getDatePriceMap } from '../../services/carPricingApi';
import { redeemPromoCode } from '../../services/promoApi';
import {
  createBooking,
  updateBooking as confirmSupabaseBooking,
  uploadBookingDocument,
  linkExistingBookingDocument,
  sendBookingConfirmationEmail,
  sendBookingRequestVendorEmail,
  createQuickbooksInvoice,
  recordQuickbooksPayment,
  createPendingInvoiceRow,
  createQuickbooksPendingInvoice,
  getPendingInvoiceQuickbooksRef,
} from '../../services/supabaseApi';
import { payWithPaystack } from '../../services/paystackCheckout';
import { useAuth } from '../../contexts/AuthContext';
import { useCheckout } from '../../contexts/CheckoutContext';
import { useBookings } from '../../contexts/BookingsContext';
import { useCart } from '../../contexts/CartContext';
import { useInbox } from '../../contexts/InboxContext';
import CheckoutHeader from '../../components/CheckoutHeader';
import CheckoutFooterButton from '../../components/CheckoutFooterButton';
import ConfirmModal from '../../components/ConfirmModal';

const SAVED_BOOKING_HOLD_MS = 24 * 60 * 60 * 1000;

function formatExpiry(date) {
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function toISODate(value) {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function CheckoutPaymentScreen() {
  const { carId, resumedBookingId } = useLocalSearchParams();
  const router = useRouter();
  const { colors } = useAppTheme();
  const { activeCurrency } = useCurrency();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { draft, resetCheckout } = useCheckout();
  const { addBooking } = useBookings();
  const { removeFromCart, saveBookingDraft, savedBookings, removeSavedBooking } = useCart();
  const { notifyBookingEvent } = useInbox();
  const { user } = useAuth();

  // Set when this screen was reached via Cart's "Complete Payment" (skips
  // straight here from checkout/(tabs)/cart.js, bypassing the other 6
  // steps) rather than the normal end of the checkout flow.
  const resumedBooking = resumedBookingId ? savedBookings.find(b => b.id === resumedBookingId) : null;

  const [car, setCar] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [savedExpiry, setSavedExpiry] = useState(null);

  useEffect(() => {
    fetchCarById(carId)
      .then(setCar)
      .finally(() => setIsLoading(false));
  }, [carId]);

  // Same billableDays/rentalCost/addonsCost/deliveryFee/securityDeposit
  // formulas as checkout/summary.js - re-derived here (not imported from
  // there, there's nothing to import - summary.js only keeps these as local
  // consts) since the Supabase bookings row has real columns for each
  // component, not just the combined total draft.totalCost already carries.
  // Fetches the trip's per-date price overrides and runs them through the
  // same calculateRentalPricing() engine as summary.js, so the rentalCost
  // persisted to bookings.rental_cost matches what the renter was shown -
  // custom per-date pricing and discounts included, not the flat rate.
  const buildPricingBreakdown = async () => {
    const datePriceMap = await getDatePriceMap(carId, {
      fromDate: toISODate(draft.startDate),
      toDate: toISODate(draft.endDate),
    }).catch(() => ({}));
    const pricing = calculateRentalPricing({
      startDate: draft.startDate,
      endDate: draft.endDate,
      pickupTime: draft.pickupTime,
      returnTime: draft.returnTime,
      drivenBy: car.drivenBy,
      dailyRate: car.pricePerDay,
      getDatePrice: (iso) => datePriceMap[iso],
      lengthOfStayDiscounts: car.lengthOfStayDiscounts,
      discount: car.discount,
    });
    const selectedAddons = (car.regionalAddons ?? [])
      .map((addon) => {
        const selection = draft.addons.find((a) => a.name === addon.name);
        return selection ? { ...addon, days: selection.days } : null;
      })
      .filter(Boolean);
    const rentalCost = pricing.rentalCost;
    const addonsCost = selectedAddons.reduce((sum, addon) => (
      sum + (addon.type === 'per_day' ? addon.price * addon.days : addon.price)
    ), 0);
    const subtotal = rentalCost + addonsCost;
    const deliveryFee = car.drivenBy === 'Self-drive' ? getSelfDriveDeliveryFee() : 0;
    const securityDeposit = calculateSecurityDeposit(subtotal, car.drivenBy);
    // Same reactive formula as checkout/summary.js - recomputed against this
    // trip's actual subtotal rather than trusting a stored amount.
    const promoDiscountAmount = draft.promoCode
      ? Math.min(subtotal, Math.max(0, draft.promoDiscountType === 'percentage'
        ? subtotal * (draft.promoDiscountValue / 100)
        : draft.promoDiscountValue))
      : 0;
    // Same "recompute live from real days, don't trust a stale draft
    // snapshot" reasoning as checkout/summary.js's own wopeCare fields.
    const wopeCarePlanId = draft.wopeCare && draft.wopeCare !== 'none' ? draft.wopeCare : null;
    const wopeCareDailyRate = wopeCarePlanId ? calculateWopeCareDailyRate(car.pricePerDay, wopeCarePlanId) : 0;
    const wopeCareCost = wopeCarePlanId ? calculateWopeCareCost(car.pricePerDay, wopeCarePlanId, pricing.billableDays) : 0;
    const wopeCareCoverage = wopeCarePlanId ? WOPECARE_PLANS[wopeCarePlanId].coverage : 0;
    return { rentalCost, addonsCost, deliveryFee, securityDeposit, promoDiscountAmount, wopeCarePlanId, wopeCareDailyRate, wopeCareCost, wopeCareCoverage, billableDays: pricing.billableDays };
  };

  const handlePay = async () => {
    setIsProcessing(true);
    setError(null);

    try {
      // Reserve: insert the Supabase row BEFORE any money moves. If this
      // fails, nothing was charged - just show an error. This is the whole
      // point of the reorder (see the "Bookings Phase 2" plan): the old
      // "charge first, hope the record write succeeds after" ordering could
      // charge a card with no booking ever created; that's now structurally
      // impossible, since a Supabase write failure can only happen here,
      // before Paystack is ever called.
      const { rentalCost, addonsCost, deliveryFee, securityDeposit, promoDiscountAmount, wopeCarePlanId, wopeCareDailyRate, wopeCareCost, wopeCareCoverage, billableDays } = await buildPricingBreakdown();

      // Redeemed (uses_count incremented) here, immediately before the
      // booking that actually spends it gets created - not back on the
      // Cost Breakdown screen's "Apply" preview, so a code is only ever
      // consumed by a booking that goes through. A failure here (e.g. it
      // was just exhausted by someone else) aborts before any booking row
      // or charge exists, same as every other failure in this block.
      let promoCode = null;
      if (draft.promoCode) {
        const redeemed = await redeemPromoCode(draft.promoCode);
        promoCode = redeemed.code;
      }

      // Resuming a saved booking that already has a real (unpaid)
      // QuickBooks invoice from Save & Pay Later time - read it back before
      // reserving, so the reservation below can reuse the same invoice
      // instead of quickbooks-create-invoice minting a duplicate for the
      // same trip. Fire-and-forget invoice creation at save time means this
      // can legitimately still be null (not landed yet) - degrades to the
      // normal fresh-invoice path below either way.
      const reusedInvoiceRef = resumedBooking?.pendingInvoiceId
        ? await getPendingInvoiceQuickbooksRef(resumedBooking.pendingInvoiceId).catch(() => null)
        : null;

      const reserved = await createBooking({
        renter_id: user.id,
        car_id: carId,
        vendor_id: car.vendorId,
        start_date: draft.startDate,
        end_date: draft.endDate,
        pickup_time: draft.pickupTime,
        return_time: draft.returnTime,
        pickup_location: draft.pickupLocation,
        return_location: draft.returnLocation,
        drive_type: car.drivenBy,
        addon_names: draft.addons.map((a) => a.name),
        addon_days: draft.addons.map((a) => a.days),
        rental_cost: rentalCost,
        addons_cost: addonsCost,
        delivery_fee: deliveryFee,
        security_deposit: securityDeposit,
        promo_code: promoCode,
        promo_discount_amount: promoDiscountAmount,
        wopecare_plan: wopeCarePlanId ?? 'none',
        wopecare_daily_rate: wopeCareDailyRate,
        wopecare_total_cost: wopeCareCost,
        wopecare_coverage: wopeCareCoverage,
        total_cost: draft.totalCost,
        // vendor_payout_per_day/vendor_payout_total/wopecar_margin are
        // NOT set here - the bookings_compute_vendor_payout trigger stamps
        // them server-side from the car's admin-only payout_per_day, so
        // this device (the renter's own) never fetches or handles that
        // rate at all. billable_days is just a plain day count, not money.
        billable_days: billableDays,
        status: 'pending',
        payment_status: 'unpaid',
      });

      if (reusedInvoiceRef?.qb_invoice_id) {
        confirmSupabaseBooking(reserved.id, {
          qb_invoice_id: reusedInvoiceRef.qb_invoice_id,
          qb_invoice_number: reusedInvoiceRef.qb_invoice_number,
          qb_customer_id: reusedInvoiceRef.qb_customer_id,
          invoice_status: 'unpaid',
        }).catch(() => {});
      } else {
        createQuickbooksInvoice(reserved.id).catch(() => {});
      }

      // Best-effort, in parallel: a failed upload shouldn't block the
      // booking itself - same "local state/booking always wins, best-effort
      // sync" spirit as the rest of this app. Uploaded under the booking's
      // own id now that one exists. Each value is either a fresh local
      // picker URI (string - genuinely new, needs uploadBookingDocument) or
      // { existing: true, filePath } (already on file from a previous
      // booking/the Documents Hub - checkout/form.js's auto-populate, just
      // links this booking to the existing file via linkExistingBookingDocument
      // rather than re-uploading the same bytes).
      await Promise.all(
        [
          draft.licenseFront && ['license_front', draft.licenseFront],
          draft.licenseBack && ['license_back', draft.licenseBack],
          draft.proofOfAddress && ['proof_of_address', draft.proofOfAddress],
        ]
          .filter(Boolean)
          .map(([type, value]) => (
            typeof value === 'string'
              ? uploadBookingDocument(user.id, reserved.id, type, value).catch(() => {})
              : linkExistingBookingDocument(user.id, reserved.id, type, value.filePath).catch(() => {})
          ))
      );

      const reference = await payWithPaystack(draft.totalCost);

      // Last fragile step: the row already exists (visible to the renter/
      // vendor/admin either way), so a failure here is a "confirm this
      // paid booking" data-fix, not a lost-money-with-no-record situation
      // like before. Still worth a few retries rather than a bare attempt,
      // since this is genuinely the one place left where a transient
      // failure would leave real state (a successful charge) unreflected.
      //
      // One error is not transient and must not be retried: Postgres code
      // 23P01 is the bookings_no_overlapping_paid_dates exclusion
      // constraint (see supabase/migrations/0041_...) rejecting this
      // payment_status: 'paid' update because another renter's booking for
      // these same car+dates was confirmed first. Retrying would fail
      // identically every time - the charge already succeeded above, so
      // this is surfaced as its own honest message rather than the generic
      // "please try again" error, and the payment reference is recorded on
      // the now-cancelled reservation so support can find and refund it.
      let confirmed;
      let lastConfirmError;
      let datesConflict = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          confirmed = await confirmSupabaseBooking(reserved.id, {
            payment_status: 'paid',
            payment_ref: reference,
          });
          break;
        } catch (e) {
          lastConfirmError = e;
          if (e.code === '23P01') {
            datesConflict = true;
            break;
          }
        }
      }
      if (!confirmed) {
        if (datesConflict) {
          await confirmSupabaseBooking(reserved.id, {
            status: 'cancelled',
            cancellation_reason: `Payment succeeded (ref ${reference}) but these dates were booked by another renter first - needs manual refund.`,
          }).catch(() => {});
          throw new Error(
            `Your payment went through, but these dates were just booked by another renter. Contact WopeCar support with reference ${reference} for a refund.`
          );
        }
        throw lastConfirmError;
      }

      sendBookingConfirmationEmail(confirmed.id).catch(() => {});
      sendBookingRequestVendorEmail(confirmed.id).catch(() => {});
      recordQuickbooksPayment(confirmed.id, reference, resumedBooking?.pendingInvoiceId).catch(() => {});

      const booking = {
        id: confirmed.id,
        carId,
        carName: car?.name,
        carImage: car?.image,
        startDate: draft.startDate,
        endDate: draft.endDate,
        pickupTime: draft.pickupTime,
        returnTime: draft.returnTime,
        pickupLocation: draft.pickupLocation,
        returnLocation: draft.returnLocation,
        addons: draft.addons,
        wopeCare: {
          plan: wopeCarePlanId ?? 'none',
          dailyRate: wopeCareDailyRate,
          totalCost: wopeCareCost,
          coverage: wopeCareCoverage,
        },
        totalCost: draft.totalCost,
        form: draft.form,
        paystackReference: reference,
        status: 'Pending',
        createdAt: confirmed.created_at,
      };
      addBooking(booking);
      removeFromCart(carId);
      if (resumedBookingId) removeSavedBooking(resumedBookingId);
      notifyBookingEvent('booking_created', booking);

      resetCheckout();
      router.replace('/(tabs)/bookings');
    } catch (e) {
      setError(e.message || 'Something went wrong. Please try again.');
      setIsProcessing(false);
    }
  };

  // Lets a renter back out of paying right now without losing the 6
  // screens of checkout progress - the local saved-booking card
  // (CartContext/cartStorage) same as before, PLUS a real pending_invoices
  // row (migration 0065) that gets its own unpaid QuickBooks invoice
  // (quickbooks-create-pending-invoice, fire-and-forget - a QuickBooks
  // failure must never block the save itself, same posture as handlePay's
  // own createQuickbooksInvoice call). No `bookings` row exists yet at this
  // point; that still only gets created once the renter actually resumes
  // and pays (handlePay above).
  const handleSaveToCart = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const { rentalCost, addonsCost, deliveryFee, securityDeposit, wopeCarePlanId, wopeCareDailyRate, wopeCareCost, billableDays } = await buildPricingBreakdown();
      const expiresAt = new Date(Date.now() + SAVED_BOOKING_HOLD_MS);

      const pendingInvoice = await createPendingInvoiceRow({
        renter_id: user.id,
        car_id: carId,
        vendor_id: car.vendorId,
        start_date: draft.startDate,
        end_date: draft.endDate,
        pickup_time: draft.pickupTime,
        return_time: draft.returnTime,
        pickup_location: draft.pickupLocation,
        return_location: draft.returnLocation,
        drive_type: car.drivenBy,
        addon_names: draft.addons.map((a) => a.name),
        addon_days: draft.addons.map((a) => a.days),
        billable_days: billableDays,
        rental_cost: rentalCost,
        addons_cost: addonsCost,
        delivery_fee: deliveryFee,
        security_deposit: securityDeposit,
        wopecare_plan: wopeCarePlanId ?? 'none',
        wopecare_daily_rate: wopeCareDailyRate,
        wopecare_total_cost: wopeCareCost,
        total_cost: draft.totalCost,
        expires_at: expiresAt.toISOString(),
      });

      createQuickbooksPendingInvoice(pendingInvoice.id).catch(() => {});

      saveBookingDraft({
        id: `saved-${carId}-${Date.now()}`,
        pendingInvoiceId: pendingInvoice.id,
        bookingRef: pendingInvoice.booking_ref,
        carId: String(carId),
        carName: car.name,
        carImage: car.image,
        carPricePerDay: car.pricePerDay,
        startDate: draft.startDate,
        endDate: draft.endDate,
        totalDays: billableDays,
        pickupTime: draft.pickupTime,
        returnTime: draft.returnTime,
        pickupLocation: draft.pickupLocation,
        returnLocation: draft.returnLocation,
        driveType: car.drivenBy,
        addons: draft.addons,
        wopeCare: { plan: wopeCarePlanId ?? 'none', totalCost: wopeCareCost },
        deliveryFee,
        securityDeposit,
        rentalCost,
        addonsCost,
        totalCost: draft.totalCost,
        form: draft.form,
        licenseFront: draft.licenseFront,
        licenseBack: draft.licenseBack,
        proofOfAddress: draft.proofOfAddress,
        savedAt: new Date().toISOString(),
        expiresAt: expiresAt.toISOString(),
      });

      setSavedExpiry(expiresAt);
    } catch (e) {
      setError(e.message || 'Could not save this booking. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleGoToCart = () => {
    setSavedExpiry(null);
    router.replace('/(tabs)/cart');
  };

  const handleContinueBrowsing = () => {
    setSavedExpiry(null);
    router.replace('/(tabs)');
  };

  if (isLoading || !car) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="large" color={colors.teal} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CheckoutHeader title="Payment" step={7} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {!!resumedBooking && (
          <View style={styles.resumeBanner}>
            <Ionicons name="time-outline" size={16} color={colors.teal} />
            <Text style={styles.resumeBannerText}>
              Resuming saved booking — expires {formatExpiry(new Date(resumedBooking.expiresAt))}
            </Text>
          </View>
        )}

        <View style={styles.paystackBadge}>
          <Text style={styles.paystackText}>Paystack</Text>
        </View>

        <View style={styles.summaryCard}>
          {car.image ? (
            <Image source={{ uri: car.image }} style={styles.carImage} contentFit="cover" />
          ) : null}
          <View style={styles.summaryInfo}>
            <Text style={styles.carName} numberOfLines={1}>{car.name}</Text>
            <Text style={styles.totalLabel}>Amount due</Text>
            <Text style={styles.totalValue}>{formatCurrency(draft.totalCost, activeCurrency)}</Text>
          </View>
        </View>

        <View style={styles.infoBox}>
          <Ionicons name="lock-closed-outline" size={16} color={colors.teal} />
          <Text style={styles.infoText}>
            Secured by Paystack. Your card details are never stored on this device.
          </Text>
        </View>

        {isProcessing && (
          <View style={styles.processingBox}>
            <ActivityIndicator size="small" color={colors.teal} />
            <Text style={styles.processingText}>Processing payment...</Text>
          </View>
        )}

        {!!error && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <View style={styles.termsRow}>
          <TouchableOpacity
            style={[styles.checkbox, agreedToTerms && styles.checkboxChecked]}
            onPress={() => setAgreedToTerms((prev) => !prev)}
            hitSlop={8}
          >
            {agreedToTerms && <Ionicons name="checkmark" size={14} color={colors.white} />}
          </TouchableOpacity>
          <Text style={styles.checkboxLabel} onPress={() => setAgreedToTerms((prev) => !prev)}>
            I agree to the{' '}
            <Text style={styles.termsLink} onPress={() => router.push({ pathname: '/terms', params: { from: 'checkout' } })}>
              Terms of Service
            </Text>
          </Text>
        </View>
      </ScrollView>

      <CheckoutFooterButton
        label={isProcessing ? 'Processing...' : `Pay ${formatCurrency(draft.totalCost, activeCurrency)}`}
        onPress={handlePay}
        disabled={isProcessing || !agreedToTerms}
        secondaryVisible={!agreedToTerms}
        secondaryLabel={isSaving ? 'Saving...' : 'Save & Pay Later'}
        onSecondaryPress={handleSaveToCart}
      />

      <ConfirmModal
        visible={!!savedExpiry}
        title="✅ Booking Saved to Cart"
        message={savedExpiry
          ? `Your ${car.name} booking has been saved. Complete payment anytime from your Cart tab.\n\n⏰ Booking held for 24 hours\nExpires: ${formatExpiry(savedExpiry)}`
          : ''}
        confirmLabel="Go to Cart"
        cancelLabel="Continue Browsing"
        onConfirm={handleGoToCart}
        onCancel={handleContinueBrowsing}
      />
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    scrollContent: {
      padding: 20,
      paddingBottom: 40,
    },
    centerState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    resumeBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.highlight,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.teal,
      padding: 12,
      marginBottom: 16,
    },
    resumeBannerText: {
      flex: 1,
      fontFamily: FONTS.medium,
      fontSize: 12.5,
      color: colors.textPrimary,
    },
    paystackBadge: {
      alignSelf: 'flex-start',
      backgroundColor: '#00C3F1',
      borderRadius: 6,
      paddingHorizontal: 10,
      paddingVertical: 5,
      marginBottom: 20,
    },
    paystackText: {
      fontFamily: FONTS.bold,
      fontSize: 12,
      color: '#ffffff',
    },
    summaryCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      backgroundColor: colors.background,
      borderRadius: 12,
      padding: 14,
      marginBottom: 20,
    },
    carImage: {
      width: 64,
      height: 64,
      borderRadius: 10,
    },
    summaryInfo: {
      flex: 1,
    },
    carName: {
      fontFamily: FONTS.semiBold,
      fontSize: 14,
      color: colors.textPrimary,
      marginBottom: 6,
    },
    totalLabel: {
      fontFamily: FONTS.regular,
      fontSize: 11,
      color: colors.textSubtle,
    },
    totalValue: {
      fontFamily: FONTS.bold,
      fontSize: 20,
      color: colors.textPrimary,
    },
    infoBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 16,
    },
    infoText: {
      flex: 1,
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textSubtle,
    },
    processingBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.highlight,
      borderRadius: 10,
      padding: 14,
    },
    processingText: {
      fontFamily: FONTS.medium,
      fontSize: 13,
      color: colors.textPrimary,
    },
    errorBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.errorBg,
      borderRadius: 10,
      padding: 14,
    },
    errorText: {
      flex: 1,
      fontFamily: FONTS.medium,
      fontSize: 13,
      color: colors.error,
    },
    termsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 16,
    },
    checkbox: {
      width: 20,
      height: 20,
      borderRadius: 5,
      borderWidth: 1.5,
      borderColor: colors.disabled,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxChecked: {
      backgroundColor: colors.teal,
      borderColor: colors.teal,
    },
    checkboxLabel: {
      flex: 1,
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textPrimary,
    },
    termsLink: {
      fontFamily: FONTS.semiBold,
      color: colors.teal,
      textDecorationLine: 'underline',
    },
  });
}
