import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS } from '../constants/theme';
import { useAppTheme } from '../contexts/ThemeContext';
import { dismissPromoBanner, fetchSiteBanner, isPromoBannerDismissed } from '../services/siteBannerApi';

// Home-screen promo card for the site-wide campaign (Detty December). Shown while the website's site banner is
// switched on in admin; same copy as the website's mobile banner. Sits above the "saved booking" card and can be
// closed with the X (remembered per promo code).
const FALLBACK_CODE = 'DETTY10';

export default function PromoBanner() {
  const { colors, isDark } = useAppTheme();
  const [code, setCode] = useState(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const banner = await fetchSiteBanner();
      if (cancelled || !banner?.isActive) return;
      const promoCode = banner.promoCode || FALLBACK_CODE;
      if (await isPromoBannerDismissed(promoCode)) return;
      if (cancelled) return;
      setCode(promoCode);
      setVisible(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!visible) return null;

  const handleClose = () => {
    setVisible(false);
    dismissPromoBanner(code);
  };

  // Light: orange-light ground with dark navy text (brand-safe contrast). Dark: a soft orange wash on the dark surface.
  const ground = isDark ? 'rgba(208, 126, 90, 0.16)' : '#F7E9E2';
  const titleColor = isDark ? colors.textPrimary : '#0E3541';
  const subColor = isDark ? colors.textBody : '#154B59';
  const codeColor = isDark ? '#FFB48F' : '#975125';

  return (
    <View style={[styles.card, { backgroundColor: ground, borderColor: COLORS.orange }]}>
      <View style={styles.topRow}>
        <Ionicons name="pricetag" size={18} color={COLORS.orange} />
        <Text style={[styles.title, { color: titleColor }]} numberOfLines={1}>
          Book December now &amp; Save 10%
        </Text>
        <TouchableOpacity onPress={handleClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close promotion">
          <Ionicons name="close" size={18} color={subColor} />
        </TouchableOpacity>
      </View>
      <Text style={[styles.subtitle, { color: subColor }]}>
        Use Code <Text style={[styles.code, { color: codeColor }]}>{code}</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    marginHorizontal: 20,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    flex: 1,
    fontFamily: FONTS.semiBold,
    fontSize: 13.5,
  },
  subtitle: {
    fontFamily: FONTS.regular,
    fontSize: 12.5,
    marginTop: 4,
    marginLeft: 26,
  },
  code: {
    fontFamily: FONTS.bold,
    letterSpacing: 0.4,
  },
});
