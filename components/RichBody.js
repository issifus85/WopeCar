import { useMemo } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { FONTS } from '../constants/theme';

// Splits a legal-doc body string into paragraph and bullet-list blocks.
// Paragraphs are separated by blank lines; a run of consecutive lines that
// all start with "• " is rendered as a proper indented list instead of
// wrapping the bullet glyph inline with the paragraph text.
function parseBody(text) {
  const blocks = text.split('\n\n').map((b) => b.trim()).filter(Boolean);
  return blocks.map((block) => {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    const isList = lines.length > 0 && lines.every((l) => l.startsWith('• '));
    if (isList) {
      return { type: 'list', items: lines.map((l) => l.slice(2).trim()) };
    }
    return { type: 'paragraph', text: block };
  });
}

export default function RichBody({ text, colors }) {
  const blocks = useMemo(() => parseBody(text), [text]);
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <>
      {blocks.map((block, i) =>
        block.type === 'list' ? (
          <View key={i} style={styles.list}>
            {block.items.map((item, j) => (
              <View key={j} style={styles.listRow}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.listText}>{item}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text key={i} style={styles.paragraph}>{block.text}</Text>
        )
      )}
    </>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    paragraph: {
      fontFamily: FONTS.regular,
      fontSize: 14,
      color: colors.textBody,
      lineHeight: 21,
      marginBottom: 14,
    },
    list: {
      marginBottom: 14,
      gap: 8,
    },
    listRow: {
      flexDirection: 'row',
      paddingLeft: 6,
    },
    bullet: {
      width: 18,
      fontFamily: FONTS.bold,
      fontSize: 14,
      lineHeight: 21,
      color: colors.teal,
    },
    listText: {
      flex: 1,
      fontFamily: FONTS.regular,
      fontSize: 14,
      color: colors.textBody,
      lineHeight: 21,
    },
  });
}
