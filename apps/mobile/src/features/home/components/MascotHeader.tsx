import React from "react";
import { StyleSheet, View } from "react-native";
import type { HomeDTO } from "@fitfloow/core";
import { greetingFor, trHour } from "../../../lib/dates";
import { fmtDate } from "../../../lib/format";
import { Floo } from "../../../mascot/Floo";
import { SpeechBubble } from "../../../mascot/SpeechBubble";
import { spacing } from "../../../theme/tokens";
import { Text } from "../../../ui/Text";

export function MascotHeader({ data }: { data: HomeDTO }) {
  const greeting = `${greetingFor(trHour())}, ${data.user.displayName}`;
  const showFloo = data.user.mascotEnabled;
  return (
    <View style={styles.wrap}>
      <View style={styles.top}>
        <View style={styles.texts}>
          <Text variant="label" color="inkMuted">
            {fmtDate(data.today.dateKey, "weekday")}
          </Text>
          <Text variant="display" accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit>
            {greeting}
          </Text>
        </View>
        {showFloo && <Floo mood={data.mascot.mood} size={72} testID="home-floo" />}
      </View>
      {showFloo && <SpeechBubble text={data.mascot.text} tail="right" style={styles.bubble} />}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  top: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm },
  texts: { flex: 1, gap: 2 },
  bubble: { marginRight: spacing.sm },
});
