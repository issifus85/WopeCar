// Month calendar for picking WopeDriver days (any set of dates, gaps allowed).
// Selected days are navy (white-on-navy passes contrast); rental days are tinted teal; the focused day has a ring.
import { useMemo } from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';

const DOW = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

export function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function parseIso(value) {
  const [y, m, d] = String(value).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d, n) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

export function dayLabel(value) {
  const d = typeof value === 'string' ? parseIso(value) : value;
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function DriverDayCalendar({ month, onMonthChange, minDate, maxDate, selected, focus, highlightRange, onTapDate }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const y = month.getFullYear();
  const m = month.getMonth();
  const lead = (new Date(y, m, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const todayIso = isoDate(new Date());
  const minIso = isoDate(minDate);
  const maxIso = isoDate(maxDate);
  const canPrev = new Date(y, m, 1) > new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  const canNext = new Date(y, m, 1) < new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);

  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(isoDate(new Date(y, m, d)));
  while (cells.length % 7) cells.push(null);

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <TouchableOpacity
          style={[styles.nav, !canPrev && styles.navDisabled]}
          disabled={!canPrev}
          onPress={() => onMonthChange(new Date(y, m - 1, 1))}
          accessibilityLabel="Previous month"
        >
          <Ionicons name="chevron-back" size={18} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>{month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</Text>
        <TouchableOpacity
          style={[styles.nav, !canNext && styles.navDisabled]}
          disabled={!canNext}
          onPress={() => onMonthChange(new Date(y, m + 1, 1))}
          accessibilityLabel="Next month"
        >
          <Ionicons name="chevron-forward" size={18} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>
      <View style={styles.row}>
        {DOW.map((d) => (
          <Text key={d} style={styles.dow}>{d}</Text>
        ))}
      </View>
      {Array.from({ length: cells.length / 7 }, (_, w) => (
        <View key={w} style={styles.row}>
          {cells.slice(w * 7, w * 7 + 7).map((k, i) => {
            if (!k) return <View key={`e${i}`} style={styles.cell} />;
            const ok = k >= minIso && k <= maxIso;
            const on = !!selected[k];
            const inRange = highlightRange && k >= highlightRange[0] && k <= highlightRange[1];
            return (
              <View key={k} style={styles.cell}>
                <TouchableOpacity
                  disabled={!ok}
                  onPress={() => onTapDate(k)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on, disabled: !ok }}
                  accessibilityLabel={`${dayLabel(k)}${ok ? (on ? ', driver added' : ', available') : ', unavailable'}`}
                  style={[
                    styles.day,
                    inRange && ok && styles.dayRental,
                    on && styles.daySelected,
                    focus === k && styles.dayFocus,
                    k === todayIso && !on && styles.dayToday,
                  ]}
                >
                  <Text style={[styles.dayText, !ok && styles.dayTextDisabled, on && styles.dayTextSelected]}>
                    {Number(k.slice(8))}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      ))}
      <View style={styles.legend}>
        <View style={styles.legendItem}><View style={[styles.swatch, { backgroundColor: colors.navy }]} /><Text style={styles.legendText}>Driver added</Text></View>
        {highlightRange ? (
          <View style={styles.legendItem}><View style={[styles.swatch, styles.dayRental]} /><Text style={styles.legendText}>Your rental</Text></View>
        ) : (
          <View style={styles.legendItem}><View style={[styles.swatch, styles.dayToday]} /><Text style={styles.legendText}>Today</Text></View>
        )}
        <View style={styles.legendItem}><View style={[styles.swatch, { backgroundColor: colors.disabled }]} /><Text style={styles.legendText}>Unavailable</Text></View>
      </View>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    nav: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.highlight },
    navDisabled: { opacity: 0.35 },
    title: { fontFamily: FONTS.semiBold, fontSize: 15, color: colors.textPrimary },
    row: { flexDirection: 'row' },
    dow: { flex: 1, textAlign: 'center', fontFamily: FONTS.medium, fontSize: 12, color: colors.textSubtle, paddingVertical: 4 },
    cell: { flex: 1, aspectRatio: 1, padding: 2 },
    day: { flex: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    dayRental: { backgroundColor: colors.highlight, borderWidth: 1, borderColor: '#9BD3D5' },
    daySelected: { backgroundColor: colors.navy, borderWidth: 0 },
    dayFocus: { borderWidth: 2, borderColor: colors.teal },
    dayToday: { borderWidth: 1.5, borderColor: colors.textPrimary },
    dayText: { fontFamily: FONTS.medium, fontSize: 14, color: colors.textPrimary },
    dayTextDisabled: { color: colors.disabled },
    dayTextSelected: { color: colors.white, fontFamily: FONTS.bold },
    legend: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10, gap: 12 },
    legendItem: { flexDirection: 'row', alignItems: 'center' },
    swatch: { width: 12, height: 12, borderRadius: 4, marginRight: 6 },
    legendText: { fontFamily: FONTS.regular, fontSize: 12, color: colors.textMuted },
  });
}
