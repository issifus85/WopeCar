// WopeDriver - book a WopeCar driver, either as an add-on to a self-drive rental (some or all of its days) or for
// the customer's own car. Steps: choose service -> pick days & set each day's trip -> review & request -> done.
// Prices on screen are a live estimate (services/wopedriverPricing.js); create_driver_booking() prices it again
// server-side and that is what is recorded. Opened from Profile (below Partner Mode) or from a rental's booking
// screen (?bookingId=..., which preselects that rental).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, Alert, BackHandler, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../constants/theme';
import { formatCurrency } from '../../constants/pricing';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import LocationSearchModal from '../../components/LocationSearchModal';
import DriverStatusPill from '../../components/wopedriver/DriverStatusPill';
import DriverDayCalendar, { isoDate, parseIso, addDays, dayLabel } from '../../components/wopedriver/DriverDayCalendar';
import {
  getDriverServiceConfig, getEligibleRentals, getMyDriverBookings, createDriverBooking,
} from '../../services/wopedriverApi';
import { quoteDay, quoteTotals, maxHoursFor, startOptions, clampDay, timeLabel, toTimeString } from '../../services/wopedriverPricing';

const STEPS = { choose: 1, plan: 2, review: 3 };

export default function WopeDriverScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();
  const { activeCurrency } = useCurrency();
  const money = useCallback((n) => formatCurrency(n, activeCurrency), [activeCurrency]);

  const [config, setConfig] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [rentals, setRentals] = useState([]);
  const [rentalsLoaded, setRentalsLoaded] = useState(false);
  const scrollRef = useRef(null);
  const [myBookings, setMyBookings] = useState([]);
  const [step, setStep] = useState('choose');
  const [mode, setMode] = useState(params.bookingId ? 'rental' : null);
  const [rentalId, setRentalId] = useState(params.bookingId ?? null);

  // Days per mode, so switching service keeps what was picked for each. { [iso]: { start, hours, zoneId } }
  const [daysByMode, setDaysByMode] = useState({ rental: {}, own: {} });
  const [focus, setFocus] = useState(null);
  const [month, setMonth] = useState(null);
  const [calNote, setCalNote] = useState('');

  const [car, setCar] = useState({ model: '', transmission: 'Automatic', plate: '' });
  const [useRentalPickup, setUseRentalPickup] = useState(true);
  const [meetingPoint, setMeetingPoint] = useState('');
  const [isLocationModalVisible, setIsLocationModalVisible] = useState(false);
  const [contactName, setContactName] = useState(user?.name ?? '');
  const [contactPhone, setContactPhone] = useState(user?.phone ?? '');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const cfg = await getDriverServiceConfig();
      setConfig(cfg);
    } catch (e) {
      setLoadError(e?.message || 'Could not load WopeDriver. Please try again.');
      return;
    }
    if (user) {
      getEligibleRentals().then(setRentals).catch(() => setRentals([])).finally(() => setRentalsLoaded(true));
      getMyDriverBookings().then(setMyBookings).catch(() => setMyBookings([]));
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (user) {
      setContactName((v) => v || user.name || '');
      setContactPhone((v) => v || user.phone || '');
    }
  }, [user]);

  const settings = config?.settings;
  const rental = rentals.find((r) => r.id === rentalId) ?? null;
  const days = mode ? daysByMode[mode] : {};
  const selectedKeys = Object.keys(days).sort();

  // A rental passed in from its booking screen: jump straight to planning once it's known to be eligible.
  useEffect(() => {
    if (params.bookingId && step === 'choose' && rental && config) setStep('plan');
  }, [params.bookingId, rental, config, step]);

  // Bookable window for the current mode.
  const today = useMemo(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); }, []);
  const noticeDays = settings ? Math.max(1, Math.ceil(settings.minNoticeHours / 24)) : 1;
  const minDate = useMemo(() => {
    const base = addDays(today, settings && settings.minNoticeHours < 24 ? 0 : noticeDays);
    if (mode === 'rental' && rental) { const s = parseIso(rental.startDate); return s > base ? s : base; }
    return base;
  }, [today, noticeDays, settings, mode, rental]);
  const maxDate = useMemo(() => {
    const horizon = addDays(today, settings?.bookingHorizonDays ?? 90);
    if (mode === 'rental' && rental) { const e = parseIso(rental.endDate); return e < horizon ? e : horizon; }
    return horizon;
  }, [today, settings, mode, rental]);

  useEffect(() => {
    if (step === 'plan') {
      const first = selectedKeys[0] ? parseIso(selectedKeys[0]) : minDate;
      setMonth(new Date(first.getFullYear(), first.getMonth(), 1));
      if (!days[focus]) setFocus(selectedKeys[0] ?? null);
    }
    // Only when entering the step or switching rental/mode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, mode, rentalId]);

  // Each step starts at the top (the review list sits above the fold otherwise).
  useEffect(() => {
    const id = requestAnimationFrame(() => scrollRef.current?.scrollTo?.({ y: 0, animated: false }));
    return () => cancelAnimationFrame(id);
  }, [step]);

  const setDays = useCallback((updater) => {
    setDaysByMode((prev) => ({ ...prev, [mode]: updater(prev[mode]) }));
  }, [mode]);

  const defaultDay = useCallback(() => ({
    start: Math.max(8, settings?.earliestStartHour ?? 8),
    hours: Math.min(8, settings?.maxHoursPerDay ?? 8),
    zoneId: config?.zones[0]?.id ?? null,
  }), [settings, config]);

  const tapDate = (k) => {
    setCalNote('');
    if (!days[k]) {
      if (selectedKeys.length >= settings.maxDaysPerRequest) {
        setCalNote(`You can add up to ${settings.maxDaysPerRequest} days per request.`);
        return;
      }
      const src = days[focus] || days[selectedKeys[selectedKeys.length - 1]] || defaultDay();
      setDays((d) => ({ ...d, [k]: clampDay(settings, { ...src }) }));
      setFocus(k);
    } else if (focus !== k) {
      setFocus(k);
    } else {
      removeDay(k);
    }
  };

  const removeDay = (k) => {
    const rest = selectedKeys.filter((x) => x !== k);
    setDays((d) => { const n = { ...d }; delete n[k]; return n; });
    setFocus(rest[rest.length - 1] ?? null);
  };

  const updateFocusDay = (patch) => {
    setDays((d) => ({ ...d, [focus]: clampDay(settings, { ...d[focus], ...patch }) }));
  };

  const selectAllRentalDays = () => {
    const out = { ...days };
    const src = days[focus] || defaultDay();
    for (let d = new Date(minDate); d <= maxDate && Object.keys(out).length < settings.maxDaysPerRequest; d = addDays(d, 1)) {
      const k = isoDate(d);
      if (!out[k]) out[k] = clampDay(settings, { ...src });
    }
    setDays(() => out);
    if (!focus) setFocus(Object.keys(out).sort()[0] ?? null);
  };

  const applyToAll = () => {
    const src = days[focus];
    if (!src) return;
    setDays((d) => Object.fromEntries(Object.keys(d).map((k) => [k, { ...src }])));
  };

  const totals = config ? quoteTotals(config, days) : null;
  const noticeCutoff = settings ? Date.now() + settings.minNoticeHours * 3600 * 1000 : 0;
  const tooSoon = (k, start) => {
    const d = parseIso(k);
    return d.getTime() + start * 3600 * 1000 < noticeCutoff;
  };
  const tooSoonDays = selectedKeys.filter((k) => tooSoon(k, days[k].start));

  const meeting = mode === 'rental' && useRentalPickup && rental?.pickupLocation ? rental.pickupLocation : meetingPoint.trim();
  const phoneOk = contactPhone.replace(/\D/g, '').length >= 9;
  const planOk = selectedKeys.length > 0 && (mode === 'rental' ? !!rental : car.model.trim().length > 1);
  const reviewOk = planOk && meeting.length > 2 && phoneOk && tooSoonDays.length === 0;

  const goBack = useCallback(() => {
    if (step === 'review') { setStep('plan'); return true; }
    if (step === 'plan') { setStep('choose'); return true; }
    if (router.canGoBack()) router.back(); else router.replace('/(tabs)/profile');
    return true;
  }, [step, router]);

  useFocusEffect(useCallback(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (step === 'done') return false;
      return goBack();
    });
    return () => sub.remove();
  }, [goBack, step]));

  const continueFromChoose = () => {
    if (!user) { router.push('/login'); return; }
    if (mode === 'rental' && !rentals.some((r) => r.id === rentalId) && rentals.length) setRentalId(rentals[0].id);
    setStep('plan');
  };

  const submit = async () => {
    if (!reviewOk || submitting) return;
    setSubmitting(true);
    try {
      const payload = {
        service_type: mode === 'rental' ? 'rental_addon' : 'own_car',
        rental_booking_id: mode === 'rental' ? rental.id : null,
        uses_rental_pickup: mode === 'rental' && useRentalPickup && !!rental?.pickupLocation,
        car_description: mode === 'own' ? car.model.trim() : null,
        car_transmission: mode === 'own' ? car.transmission : null,
        car_plate: mode === 'own' ? car.plate.trim() : null,
        meeting_point: meeting,
        contact_name: contactName.trim(),
        contact_phone: contactPhone.trim(),
        contact_email: user?.email ?? null,
        notes: notes.trim(),
        days: selectedKeys.map((k) => ({ date: k, start: toTimeString(days[k].start), hours: days[k].hours, zone_id: days[k].zoneId })),
      };
      const res = await createDriverBooking(payload);
      setResult(res);
      setDaysByMode((prev) => ({ ...prev, [mode]: {} }));
      setNotes('');
      setStep('done');
      getMyDriverBookings().then(setMyBookings).catch(() => {});
    } catch (e) {
      Alert.alert('Could not send your request', e?.message || 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------------------------------------
  if (loadError) {
    return (
      <View style={styles.container}>
        <Header styles={styles} colors={colors} title="WopeDriver" onBack={goBack} />
        <View style={styles.center}>
          <Text style={styles.hint}>{loadError}</Text>
          <TouchableOpacity style={[styles.primaryButton, { marginTop: 16, alignSelf: 'stretch' }]} onPress={load}>
            <Text style={styles.primaryButtonText}>Try again</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }
  if (!config) {
    return (
      <View style={styles.container}>
        <Header styles={styles} colors={colors} title="WopeDriver" onBack={goBack} />
        <View style={styles.center}><ActivityIndicator color={colors.teal} /></View>
      </View>
    );
  }

  if (step === 'done') {
    return (
      <View style={[styles.container, styles.center, { paddingHorizontal: 28 }]}>
        <View style={styles.doneIcon}><Ionicons name="checkmark" size={36} color={colors.white} /></View>
        <Text style={styles.doneTitle}>Driver request received</Text>
        <Text style={styles.doneText}>
          Expect a confirmation from WopeCar within 24 hours. We'll send your driver's details by email and in the app.
        </Text>
        {!!result?.booking_ref && <Text style={styles.doneRef}>{result.booking_ref}</Text>}
        <TouchableOpacity style={[styles.primaryButton, styles.fullWidth]} onPress={() => router.replace({ pathname: '/wopedriver/[id]', params: { id: result.id } })}>
          <Text style={styles.primaryButtonText}>View request</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.ghostButton, styles.fullWidth]} onPress={() => { setResult(null); setStep('choose'); }}>
          <Text style={styles.ghostButtonText}>Done</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const stepNo = STEPS[step];
  const title = step === 'choose' ? 'WopeDriver' : step === 'plan' ? (mode === 'own' ? 'Driver for your car' : 'Add a driver') : 'Review driver request';
  const subtitle = step === 'choose' ? 'A licensed driver for any trip' : step === 'plan' ? (mode === 'own' ? 'No rental needed' : 'Optional add-on to your rental') : `${mode === 'own' ? (car.model.trim() || 'Your own car') : rental?.carName ?? ''} · ${selectedKeys.length} ${selectedKeys.length === 1 ? 'day' : 'days'}`;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Header styles={styles} colors={colors} title={title} subtitle={subtitle} step={stepNo} onBack={goBack} />

      <ScrollView ref={scrollRef} key={step} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {/* ------------------------------ Step 1: choose a service ------------------------------ */}
        {step === 'choose' && (
          <>
            {!settings.isEnabled && (
              <View style={[styles.banner, { backgroundColor: colors.warningBg }]}>
                <Ionicons name="pause-circle-outline" size={20} color={colors.warning} />
                <Text style={[styles.bannerText, { color: colors.warning }]}>WopeDriver isn't taking new requests right now. Please check back soon.</Text>
              </View>
            )}

            {myBookings.length > 0 && (
              <>
                <Text style={styles.subHeading}>Your driver bookings</Text>
                <View style={styles.listCard}>
                  {myBookings.slice(0, 5).map((b, i) => (
                    <TouchableOpacity
                      key={b.id}
                      style={[styles.listRow, i === Math.min(myBookings.length, 5) - 1 && styles.listRowLast]}
                      onPress={() => router.push({ pathname: '/wopedriver/[id]', params: { id: b.id } })}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.listTitle}>{b.ref} · {b.carDescription || 'Driver'}</Text>
                        <Text style={styles.listSub}>
                          {b.firstDate ? dayLabel(b.firstDate) : ''}{b.lastDate && b.lastDate !== b.firstDate ? ` – ${dayLabel(b.lastDate)}` : ''} · {b.dayCount} {b.dayCount === 1 ? 'day' : 'days'}
                        </Text>
                      </View>
                      <DriverStatusPill status={b.status} />
                      <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            <Text style={styles.subHeading}>What do you need?</Text>
            <Text style={styles.hint}>You can use WopeDriver with or without a WopeCar rental.</Text>
            <ModeOption
              styles={styles} colors={colors} icon="car-outline" selected={mode === 'rental'}
              title="Add a driver to my rental"
              sub={user && rentalsLoaded && rentals.length === 0 ? 'No upcoming paid self-drive rentals on your account yet' : 'For days of a WopeCar self-drive booking'}
              disabled={!!user && rentalsLoaded && rentals.length === 0}
              onPress={() => setMode('rental')}
            />
            <ModeOption
              styles={styles} colors={colors} icon="key-outline" selected={mode === 'own'}
              title="A driver for my own car"
              sub="We send a WopeDriver to drive your vehicle"
              onPress={() => setMode('own')}
            />

            <Text style={[styles.subHeading, { marginTop: 18 }]}>Simple rates</Text>
            <View style={styles.rateStrip}>
              {config.packages.map((p) => (
                <View key={p.id} style={styles.rateTile}>
                  <Text style={styles.rateLabel}>{p.label}</Text>
                  <Text style={styles.ratePrice}>{money(p.price)}</Text>
                  <Text style={styles.rateHours}>{p.description || `Up to ${p.hours} hrs`}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.hint}>
              Extra hours {money(settings.extraHourRate)}/hr. {config.zones.some((z) => z.addonFee > 0) ? 'Plus a per-day add-on for trips outside Greater Accra:' : ''}
            </Text>
            {config.zones.filter((z) => z.addonFee > 0).map((z) => (
              <Text key={z.id} style={styles.zoneLine}>• {z.label}{z.description ? ` (${z.description})` : ''}: +{money(z.addonFee)}/day</Text>
            ))}
            {!!settings.serviceNote && (
              <View style={[styles.banner, { marginTop: 14 }]}>
                <Ionicons name="shield-checkmark-outline" size={20} color={colors.teal} />
                <Text style={styles.bannerText}>{settings.serviceNote}</Text>
              </View>
            )}
          </>
        )}

        {/* ------------------------------ Step 2: days & trip ------------------------------ */}
        {step === 'plan' && month && (
          <>
            {mode === 'rental' ? (
              <>
                {rentals.length > 1 ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                    {rentals.map((r) => (
                      <TouchableOpacity key={r.id} style={[styles.rentalChip, r.id === rentalId && styles.rentalChipSelected]} onPress={() => { setRentalId(r.id); setDaysByMode((p) => ({ ...p, rental: {} })); setFocus(null); }}>
                        <Text style={[styles.rentalChipTitle, r.id === rentalId && styles.rentalChipTitleSelected]}>{r.carName}</Text>
                        <Text style={[styles.rentalChipSub, r.id === rentalId && styles.rentalChipTitleSelected]}>{dayLabel(r.startDate)} – {dayLabel(r.endDate)}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                ) : rental ? (
                  <View style={styles.pill}>
                    <Ionicons name="calendar-outline" size={16} color={colors.textPrimary} />
                    <Text style={styles.pillText}>{rental.carName} · {dayLabel(rental.startDate)} – {dayLabel(rental.endDate)}</Text>
                  </View>
                ) : null}
                <View style={styles.banner}>
                  <Ionicons name="shield-checkmark-outline" size={20} color={colors.teal} />
                  <Text style={styles.bannerText}><Text style={styles.bold}>Licensed & background-checked. </Text>Your driver takes the wheel on the days you pick. You can't drive the car yourself on those days.</Text>
                </View>
              </>
            ) : (
              <>
                <View style={styles.banner}>
                  <Ionicons name="key-outline" size={20} color={colors.teal} />
                  <Text style={styles.bannerText}><Text style={styles.bold}>Your car, our driver. </Text>A background-checked WopeDriver collects your car and drives it for the hours you choose. {settings.ownCarNote}</Text>
                </View>
                <Text style={styles.fieldLabel}>Car make & model</Text>
                <TextInput style={styles.input} value={car.model} onChangeText={(v) => setCar((c) => ({ ...c, model: v }))} placeholder="e.g. Toyota Camry" placeholderTextColor={colors.textSubtle} />
                <View style={styles.row2}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>Transmission</Text>
                    <View style={styles.segment}>
                      {['Automatic', 'Manual'].map((t) => (
                        <TouchableOpacity key={t} style={[styles.segmentItem, car.transmission === t && styles.segmentItemSelected]} onPress={() => setCar((c) => ({ ...c, transmission: t }))}>
                          <Text style={[styles.segmentText, car.transmission === t && styles.segmentTextSelected]}>{t}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>Plate (optional)</Text>
                    <TextInput style={[styles.input, { marginBottom: 0 }]} value={car.plate} onChangeText={(v) => setCar((c) => ({ ...c, plate: v.toUpperCase() }))} placeholder="GR 1234-26" placeholderTextColor={colors.textSubtle} autoCapitalize="characters" />
                  </View>
                </View>
              </>
            )}

            <Text style={styles.subHeading}>Pick your days</Text>
            <Text style={styles.hint}>
              {mode === 'rental'
                ? 'Only your rental dates can be picked. Tap a date to add a driver, tap a selected date to edit it, tap again to remove.'
                : `Tap any dates (up to ${settings.maxDaysPerRequest} days, they don't need to be next to each other). Tap a selected date to edit it, tap again to remove.`}
            </Text>
            <DriverDayCalendar
              month={month}
              onMonthChange={setMonth}
              minDate={minDate}
              maxDate={maxDate}
              selected={days}
              focus={focus}
              highlightRange={mode === 'rental' && rental ? [rental.startDate, rental.endDate] : null}
              onTapDate={tapDate}
            />
            {!!calNote && <Text style={styles.calNote}>{calNote}</Text>}
            <View style={styles.calActions}>
              {mode === 'rental' ? (
                <TouchableOpacity onPress={selectAllRentalDays}><Text style={styles.link}>Select all rental days</Text></TouchableOpacity>
              ) : <View />}
              {selectedKeys.length > 0 && (
                <TouchableOpacity onPress={() => { setDays(() => ({})); setFocus(null); }}><Text style={styles.link}>Clear all</Text></TouchableOpacity>
              )}
            </View>

            {selectedKeys.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                {selectedKeys.map((k) => (
                  <TouchableOpacity key={k} style={[styles.dayPill, focus === k && styles.dayPillFocus]} onPress={() => { setFocus(k); const d = parseIso(k); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); }}>
                    <Text style={[styles.dayPillText, focus === k && styles.dayPillTextFocus]}>{dayLabel(k)}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {days[focus] ? (
              <DayEditor
                styles={styles} colors={colors} money={money} config={config} dateKey={focus} day={days[focus]}
                warn={tooSoon(focus, days[focus].start) ? `Needs at least ${settings.minNoticeHours} hours' notice. Pick a later time or date.` : null}
                onChange={updateFocusDay} onRemove={() => removeDay(focus)}
              />
            ) : (
              <View style={[styles.editCard, styles.editCardEmpty]}>
                <Text style={styles.hint}>{selectedKeys.length ? 'Tap a selected date to edit its trip.' : 'No driver days yet. Tap a date on the calendar to add one.'}</Text>
              </View>
            )}

            {selectedKeys.length > 1 && days[focus] && (
              <TouchableOpacity onPress={applyToAll} style={{ marginTop: 10 }}>
                <Text style={styles.link}>Use {dayLabel(focus)}'s settings for all {selectedKeys.length} days</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {/* ------------------------------ Step 3: review ------------------------------ */}
        {step === 'review' && totals && (
          <>
            {totals.items.map((it) => (
              <View key={it.date} style={styles.reviewItem}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.reviewDay}>{dayLabel(it.date)}</Text>
                  <Text style={styles.reviewSub}>
                    {timeLabel(it.day.start)} – {timeLabel(it.day.start + it.day.hours)} · {it.quote.zone?.label ?? ''}
                  </Text>
                  {tooSoon(it.date, it.day.start) && <Text style={styles.warnText}>Too soon: needs {settings.minNoticeHours} hours' notice</Text>}
                </View>
                <Text style={styles.reviewPrice}>{money(it.quote.total)}</Text>
              </View>
            ))}
            <View style={styles.totalsCard}>
              <TotalLine styles={styles} label="Base rates" value={money(totals.base)} />
              {totals.extra > 0 && <TotalLine styles={styles} label="Extra hours" value={money(totals.extra)} />}
              <TotalLine styles={styles} label="Location add-ons" value={totals.addon ? money(totals.addon) : '—'} />
            </View>

            <Text style={styles.subHeading}>{mode === 'own' ? 'Pickup address' : 'Meeting point'}</Text>
            {mode === 'rental' && !!rental?.pickupLocation && (
              <TouchableOpacity style={styles.checkRow} onPress={() => setUseRentalPickup((v) => !v)}>
                <Ionicons name={useRentalPickup ? 'checkbox' : 'square-outline'} size={22} color={useRentalPickup ? colors.teal : colors.textSubtle} />
                <Text style={styles.checkText}>Meet me at my rental pickup point ({rental.pickupLocation})</Text>
              </TouchableOpacity>
            )}
            {!(mode === 'rental' && useRentalPickup && rental?.pickupLocation) && (
              <View style={styles.inputWithButton}>
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  value={meetingPoint}
                  onChangeText={setMeetingPoint}
                  placeholder={mode === 'own' ? 'Where should we collect your car?' : 'Meeting point, e.g. Labone, Accra'}
                  placeholderTextColor={colors.textSubtle}
                />
                <TouchableOpacity style={styles.searchButton} onPress={() => setIsLocationModalVisible(true)} accessibilityLabel="Search for a place">
                  <Ionicons name="search" size={18} color={colors.white} />
                </TouchableOpacity>
              </View>
            )}

            <Text style={styles.subHeading}>Contact</Text>
            <TextInput style={styles.input} value={contactName} onChangeText={setContactName} placeholder="Your name" placeholderTextColor={colors.textSubtle} />
            <TextInput style={styles.input} value={contactPhone} onChangeText={setContactPhone} placeholder="Phone number for your driver" placeholderTextColor={colors.textSubtle} keyboardType="phone-pad" />
            <TextInput
              style={[styles.input, styles.textarea]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Notes for your driver (optional): flight number, stops, luggage..."
              placeholderTextColor={colors.textSubtle}
              multiline
            />
            <Text style={styles.hint}>Subject to driver availability. WopeCar confirms within 24 hours. Nothing is charged until your driver is confirmed.</Text>
          </>
        )}
      </ScrollView>

      {/* ------------------------------ Footer ------------------------------ */}
      <View style={styles.footer}>
        {step !== 'choose' && totals && (
          <View style={styles.footerMeta}>
            <Text style={styles.footerCount}>
              {step === 'review' ? 'Estimated total' : `${selectedKeys.length} ${selectedKeys.length === 1 ? 'day' : 'days'} with a driver`}
            </Text>
            <Text style={styles.footerTotal}>{money(totals.total)}</Text>
          </View>
        )}
        {step === 'choose' && (
          <TouchableOpacity style={[styles.primaryButton, (!mode || !settings.isEnabled) && styles.primaryButtonDisabled]} disabled={!mode || !settings.isEnabled} onPress={continueFromChoose}>
            <Text style={styles.primaryButtonText}>{user ? 'Continue' : 'Sign in to continue'}</Text>
          </TouchableOpacity>
        )}
        {step === 'plan' && (
          <TouchableOpacity style={[styles.primaryButton, !planOk && styles.primaryButtonDisabled]} disabled={!planOk} onPress={() => setStep('review')}>
            <Text style={styles.primaryButtonText}>Review driver request</Text>
          </TouchableOpacity>
        )}
        {step === 'review' && (
          <TouchableOpacity style={[styles.primaryButton, (!reviewOk || submitting) && styles.primaryButtonDisabled]} disabled={!reviewOk || submitting} onPress={submit}>
            {submitting ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryButtonText}>Request driver</Text>}
          </TouchableOpacity>
        )}
      </View>

      <LocationSearchModal
        visible={isLocationModalVisible}
        title={mode === 'own' ? 'Pickup address' : 'Meeting point'}
        onClose={() => setIsLocationModalVisible(false)}
        onSelect={(place) => { setMeetingPoint(place); setIsLocationModalVisible(false); }}
      />
    </KeyboardAvoidingView>
  );
}

function Header({ styles, colors, title, subtitle, step, onBack }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onBack} hitSlop={10} accessibilityLabel="Back">
        <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
      </TouchableOpacity>
      <Text style={styles.title}>{title}</Text>
      {!!subtitle && <Text style={styles.subtitle}>{subtitle}{step ? ` · Step ${step} of 3` : ''}</Text>}
      {!!step && (
        <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${(step / 3) * 100}%` }]} /></View>
      )}
    </View>
  );
}

function ModeOption({ styles, colors, icon, title, sub, selected, disabled, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.modeOption, selected && styles.modeOptionSelected, disabled && styles.modeOptionDisabled]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
    >
      <View style={[styles.modeIcon, selected && { backgroundColor: colors.navy }]}>
        <Ionicons name={icon} size={20} color={selected ? colors.white : colors.teal} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.modeTitle}>{title}</Text>
        <Text style={styles.modeSub}>{sub}</Text>
      </View>
      <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={22} color={selected ? colors.textPrimary : colors.textSubtle} />
    </TouchableOpacity>
  );
}

function DayEditor({ styles, colors, money, config, dateKey, day, warn, onChange, onRemove }) {
  const s = config.settings;
  const q = quoteDay(config, day.hours, day.zoneId);
  const opts = startOptions(s);
  const idx = opts.indexOf(day.start);
  const maxH = maxHoursFor(s, day.start);
  return (
    <View style={styles.editCard}>
      <View style={styles.editHead}>
        <Text style={styles.editDay}>{dayLabel(dateKey)}</Text>
        <Text style={styles.editPrice}>{money(q.total)}</Text>
      </View>
      <View style={styles.row2}>
        <View style={{ flex: 1 }}>
          <Text style={styles.fieldLabel}>Start time</Text>
          <Stepper styles={styles} colors={colors} label={timeLabel(day.start)} canMinus={idx > 0} canPlus={idx < opts.length - 1}
            onMinus={() => onChange({ start: opts[idx - 1] })} onPlus={() => onChange({ start: opts[idx + 1] })} minusLabel="Earlier" plusLabel="Later" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.fieldLabel}>Hours</Text>
          <Stepper styles={styles} colors={colors} label={`${day.hours} hrs`} canMinus={day.hours > s.minHours} canPlus={day.hours + 1 <= maxH}
            onMinus={() => onChange({ hours: day.hours - 1 })} onPlus={() => onChange({ hours: day.hours + 1 })} minusLabel="Fewer hours" plusLabel="More hours" />
        </View>
      </View>
      <Text style={[styles.hint, { marginTop: 8 }]}>
        {q.packageLabel} · ends {timeLabel(day.start + day.hours)}{q.extraHours ? ` · ${q.extraHours} extra hrs ${money(q.extra)}` : ''}
      </Text>
      {!!warn && <Text style={styles.warnText}>{warn}</Text>}
      <Text style={[styles.fieldLabel, { marginTop: 10 }]}>Where to?</Text>
      {config.zones.map((z) => {
        const sel = z.id === day.zoneId;
        return (
          <TouchableOpacity key={z.id} style={[styles.zoneOption, sel && styles.zoneOptionSelected]} onPress={() => onChange({ zoneId: z.id })} accessibilityRole="radio" accessibilityState={{ selected: sel }}>
            <Ionicons name={sel ? 'radio-button-on' : 'radio-button-off'} size={20} color={sel ? colors.textPrimary : colors.textSubtle} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.zoneTitle}>{z.label}</Text>
              {!!z.description && <Text style={styles.zoneSub}>{z.description}</Text>}
            </View>
            <Text style={[styles.zonePrice, z.addonFee === 0 && { color: colors.success }]}>{z.addonFee === 0 ? 'Included' : `+${money(z.addonFee)}`}</Text>
          </TouchableOpacity>
        );
      })}
      <TouchableOpacity onPress={onRemove} style={{ marginTop: 8 }}>
        <Text style={[styles.link, { color: colors.error }]}>Remove this day</Text>
      </TouchableOpacity>
    </View>
  );
}

function Stepper({ styles, colors, label, canMinus, canPlus, onMinus, onPlus, minusLabel, plusLabel }) {
  return (
    <View style={styles.stepper}>
      <TouchableOpacity style={styles.stepperButton} disabled={!canMinus} onPress={onMinus} accessibilityLabel={minusLabel}>
        <Ionicons name="remove" size={18} color={canMinus ? colors.textPrimary : colors.disabled} />
      </TouchableOpacity>
      <Text style={styles.stepperValue}>{label}</Text>
      <TouchableOpacity style={styles.stepperButton} disabled={!canPlus} onPress={onPlus} accessibilityLabel={plusLabel}>
        <Ionicons name="add" size={18} color={canPlus ? colors.textPrimary : colors.disabled} />
      </TouchableOpacity>
    </View>
  );
}

function TotalLine({ styles, label, value }) {
  return (
    <View style={styles.totalLine}>
      <Text style={styles.totalLabel}>{label}</Text>
      <Text style={styles.totalValue}>{value}</Text>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    header: { paddingTop: 56, paddingHorizontal: 20, paddingBottom: 14, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.divider },
    title: { fontFamily: FONTS.bold, fontSize: 22, color: colors.textPrimary, marginTop: 10 },
    subtitle: { fontFamily: FONTS.regular, fontSize: 13, color: colors.textSubtle, marginTop: 2 },
    progressTrack: { height: 4, borderRadius: 2, backgroundColor: colors.divider, overflow: 'hidden', marginTop: 12 },
    progressFill: { height: 4, borderRadius: 2, backgroundColor: colors.teal },
    content: { padding: 20, paddingBottom: 40 },
    subHeading: { fontFamily: FONTS.semiBold, fontSize: 16, color: colors.textPrimary, marginTop: 14, marginBottom: 4 },
    hint: { fontFamily: FONTS.regular, fontSize: 13, color: colors.textMuted, lineHeight: 18, marginBottom: 8 },
    bold: { fontFamily: FONTS.semiBold },
    banner: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: colors.highlight, borderRadius: 12, padding: 12, marginBottom: 12 },
    bannerText: { flex: 1, fontFamily: FONTS.regular, fontSize: 13, lineHeight: 18, color: colors.textBody },
    modeOption: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: colors.border, marginTop: 8 },
    modeOptionSelected: { borderColor: colors.textPrimary },
    modeOptionDisabled: { opacity: 0.55 },
    modeIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.highlight, alignItems: 'center', justifyContent: 'center' },
    modeTitle: { fontFamily: FONTS.semiBold, fontSize: 15, color: colors.textPrimary },
    modeSub: { fontFamily: FONTS.regular, fontSize: 12, color: colors.textMuted, marginTop: 2 },
    rateStrip: { flexDirection: 'row', gap: 8, marginTop: 6, marginBottom: 8 },
    rateTile: { flex: 1, backgroundColor: colors.surface, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: colors.border },
    rateLabel: { fontFamily: FONTS.medium, fontSize: 12, color: colors.textMuted },
    ratePrice: { fontFamily: FONTS.bold, fontSize: 16, color: colors.textPrimary, marginTop: 2 },
    rateHours: { fontFamily: FONTS.regular, fontSize: 11, color: colors.textSubtle, marginTop: 2 },
    zoneLine: { fontFamily: FONTS.regular, fontSize: 13, color: colors.textBody, marginBottom: 2 },
    listCard: { backgroundColor: colors.surface, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, marginBottom: 6 },
    listRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderBottomWidth: 1, borderBottomColor: colors.divider },
    listRowLast: { borderBottomWidth: 0 },
    listTitle: { fontFamily: FONTS.semiBold, fontSize: 14, color: colors.textPrimary },
    listSub: { fontFamily: FONTS.regular, fontSize: 12, color: colors.textMuted, marginTop: 2 },
    pill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: colors.surface, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: colors.border, marginBottom: 10 },
    pillText: { fontFamily: FONTS.medium, fontSize: 13, color: colors.textPrimary },
    rentalChip: { backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1.5, borderColor: colors.border, marginRight: 8 },
    rentalChipSelected: { backgroundColor: colors.navy, borderColor: colors.navy },
    rentalChipTitle: { fontFamily: FONTS.semiBold, fontSize: 13, color: colors.textPrimary },
    rentalChipSub: { fontFamily: FONTS.regular, fontSize: 11, color: colors.textMuted, marginTop: 1 },
    rentalChipTitleSelected: { color: colors.white },
    fieldLabel: { fontFamily: FONTS.medium, fontSize: 12, color: colors.textMuted, marginBottom: 6 },
    input: { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 11, fontFamily: FONTS.regular, fontSize: 15, color: colors.textPrimary, marginBottom: 10 },
    textarea: { minHeight: 80, textAlignVertical: 'top' },
    inputWithButton: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
    searchButton: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' },
    row2: { flexDirection: 'row', gap: 10 },
    segment: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
    segmentItem: { flex: 1, paddingVertical: 11, alignItems: 'center' },
    segmentItemSelected: { backgroundColor: colors.navy },
    segmentText: { fontFamily: FONTS.medium, fontSize: 13, color: colors.textPrimary },
    segmentTextSelected: { color: colors.white },
    calNote: { fontFamily: FONTS.medium, fontSize: 13, color: colors.warning, marginTop: 8 },
    calActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, marginBottom: 10 },
    link: { fontFamily: FONTS.semiBold, fontSize: 14, color: colors.teal },
    dayPill: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginRight: 6 },
    dayPillFocus: { backgroundColor: colors.navy, borderColor: colors.navy },
    dayPillText: { fontFamily: FONTS.medium, fontSize: 12, color: colors.textPrimary },
    dayPillTextFocus: { color: colors.white },
    editCard: { backgroundColor: colors.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border },
    editCardEmpty: { alignItems: 'center' },
    editHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    editDay: { fontFamily: FONTS.bold, fontSize: 15, color: colors.textPrimary },
    editPrice: { fontFamily: FONTS.bold, fontSize: 15, color: colors.textPrimary },
    stepper: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
    stepperButton: { width: 38, height: 42, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.highlight },
    stepperValue: { flex: 1, textAlign: 'center', fontFamily: FONTS.semiBold, fontSize: 14, color: colors.textPrimary },
    zoneOption: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 10, marginBottom: 6 },
    zoneOptionSelected: { borderColor: colors.textPrimary, backgroundColor: colors.highlight },
    zoneTitle: { fontFamily: FONTS.semiBold, fontSize: 14, color: colors.textPrimary },
    zoneSub: { fontFamily: FONTS.regular, fontSize: 12, color: colors.textMuted, marginTop: 1 },
    zonePrice: { fontFamily: FONTS.semiBold, fontSize: 13, color: colors.textPrimary },
    warnText: { fontFamily: FONTS.medium, fontSize: 12, color: colors.error, marginTop: 2 },
    reviewItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.divider },
    reviewDay: { fontFamily: FONTS.semiBold, fontSize: 14, color: colors.textPrimary },
    reviewSub: { fontFamily: FONTS.regular, fontSize: 12, color: colors.textMuted, marginTop: 2 },
    reviewPrice: { fontFamily: FONTS.bold, fontSize: 14, color: colors.textPrimary },
    totalsCard: { marginTop: 10, marginBottom: 4 },
    totalLine: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
    totalLabel: { fontFamily: FONTS.regular, fontSize: 14, color: colors.textMuted },
    totalValue: { fontFamily: FONTS.semiBold, fontSize: 14, color: colors.textPrimary },
    checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
    checkText: { flex: 1, fontFamily: FONTS.regular, fontSize: 14, color: colors.textBody },
    footer: { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.divider, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 30 },
    footerMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 },
    footerCount: { fontFamily: FONTS.regular, fontSize: 13, color: colors.textMuted },
    footerTotal: { fontFamily: FONTS.bold, fontSize: 20, color: colors.textPrimary },
    primaryButton: { backgroundColor: colors.navy, borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
    primaryButtonDisabled: { backgroundColor: colors.disabled },
    primaryButtonText: { fontFamily: FONTS.semiBold, fontSize: 16, color: colors.white },
    ghostButton: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: colors.border, marginTop: 10 },
    ghostButtonText: { fontFamily: FONTS.semiBold, fontSize: 15, color: colors.textPrimary },
    fullWidth: { alignSelf: 'stretch' },
    doneIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
    doneTitle: { fontFamily: FONTS.bold, fontSize: 22, color: colors.textPrimary, textAlign: 'center' },
    doneText: { fontFamily: FONTS.regular, fontSize: 14, color: colors.textMuted, textAlign: 'center', marginTop: 8, lineHeight: 20 },
    doneRef: { fontFamily: FONTS.bold, fontSize: 16, color: colors.textPrimary, marginTop: 14, marginBottom: 22, letterSpacing: 1 },
  });
}
