import { StyleSheet, Text, View, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS } from '../constants/theme';
import SectionHeading from './SectionHeading';

function formatMemberSince(dateString) {
  if (!dateString) return null;
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export default function CarOwnerCard({ owner }) {
  if (!owner) return null;

  const memberSince = formatMemberSince(owner.memberSince);

  return (
    <View>
      <SectionHeading>Partner</SectionHeading>
      <View style={styles.card}>
        {owner.avatar ? (
          <Image source={{ uri: owner.avatar }} style={styles.avatarImage} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Ionicons name="person" size={22} color={COLORS.teal} />
          </View>
        )}
        <View style={styles.info}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{owner.name}</Text>
            {owner.isVerified && (
              <Ionicons name="checkmark-circle" size={16} color={COLORS.teal} />
            )}
          </View>
          {!!memberSince && (
            <Text style={styles.memberSince}>Member since {memberSince}</Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.background,
    borderRadius: 14,
    padding: 14,
  },
  avatarImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EEF9F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  name: {
    fontFamily: FONTS.semiBold,
    fontSize: 15,
    color: COLORS.navy,
  },
  memberSince: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
});
