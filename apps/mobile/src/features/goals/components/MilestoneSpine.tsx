import React from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "../../../theme/ThemeProvider";
import { spacing } from "../../../theme/tokens";
import { Icon } from "../../../ui/Icon";
import { Text } from "../../../ui/Text";
import { fmtDate, fmtNumber, fmtPct } from "../../../lib/format";
import type { GoalMilestone } from "../goalIntent";

export interface MilestoneSpineProps {
  milestones: GoalMilestone[];
  /** Today's key, so passed milestones read as done rather than pending. */
  todayKey: string;
  /** `compact` rides inside the blue plan card; `full` is the roadmap's own spine. */
  variant?: "compact" | "full";
  testID?: string;
}

/**
 * The four quarter-points of the plan, as a rail.
 *
 * This is the answer to "when do I get where" in one glance: four dots, four dates, four bodies.
 * The compact form sits under the plan summary; the full form is the roadmap's spine.
 */
export function MilestoneSpine({ milestones, todayKey, variant = "compact", testID }: MilestoneSpineProps) {
  if (milestones.length === 0) return null;
  return variant === "compact" ? <Compact milestones={milestones} todayKey={todayKey} testID={testID} /> : <Full milestones={milestones} todayKey={todayKey} testID={testID} />;
}

function Compact({ milestones, todayKey, testID }: Omit<MilestoneSpineProps, "variant">) {
  const { colors } = useTheme();
  return (
    <View style={styles.compact} testID={testID} accessibilityLabel={`Ara duraklar: ${milestones.map((m) => `${fmtDate(m.dateKey, "short")} ${fmtNumber(m.weightKg, 1)} kilo`).join(", ")}`}>
      <View style={[styles.rail, { backgroundColor: colors.onPrimaryBorder }]} />
      {milestones.map((m) => {
        const done = m.dateKey <= todayKey;
        return (
          <View key={m.fraction} style={styles.stop}>
            <View style={[styles.dot, { backgroundColor: done ? colors.onPrimary : colors.primaryStrong, borderColor: colors.onPrimary }]} />
            <Text variant="caption" color="onPrimary" tabular numberOfLines={1}>
              {fmtDate(m.dateKey, "short")}
            </Text>
            <Text variant="caption" color="onPrimaryMuted" tabular numberOfLines={1}>
              {fmtNumber(m.weightKg, 1)} kg
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function Full({ milestones, todayKey, testID }: Omit<MilestoneSpineProps, "variant">) {
  const { colors } = useTheme();
  return (
    <View style={styles.full} testID={testID}>
      {milestones.map((m, i) => {
        const done = m.dateKey <= todayKey;
        const last = i === milestones.length - 1;
        return (
          <View key={m.fraction} style={styles.fullRow} testID={testID ? `${testID}-${i}` : undefined}>
            <View style={styles.gutter}>
              <View style={[styles.fullDot, { backgroundColor: done ? colors.primary : colors.surface, borderColor: done ? colors.primary : colors.borderStrong }]}>
                {done ? <Icon icon="check" size={12} color="onPrimary" /> : null}
              </View>
              {!last ? <View style={[styles.connector, { backgroundColor: colors.border }]} /> : null}
            </View>
            <View style={styles.fullTexts}>
              <View style={styles.fullHead}>
                <Text variant="bodyStrong" tabular>
                  {fmtDate(m.dateKey, "long")}
                </Text>
                <Text variant="caption" color="inkMuted">
                  {m.etaLabelTr}
                </Text>
              </View>
              <Text variant="body" color="inkMuted" tabular>
                {fmtNumber(m.weightKg, 1)} kg · {fmtPct(m.bodyFatPct, 1)} yağ · yolun {`${fmtPct(m.fraction * 100, 0)}'i`}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const DOT = 10;
const FULL_DOT = 22;

const styles = StyleSheet.create({
  compact: { flexDirection: "row", alignItems: "flex-start", paddingTop: spacing.sm },
  rail: { position: "absolute", left: "12%", right: "12%", top: spacing.sm + DOT / 2 - 1, height: 2, borderRadius: 1 },
  stop: { flex: 1, alignItems: "center", gap: 2 },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2, borderWidth: 2, marginBottom: spacing.xs },

  full: { gap: 0 },
  fullRow: { flexDirection: "row", gap: spacing.md, minHeight: 64 },
  gutter: { alignItems: "center", width: FULL_DOT },
  fullDot: { width: FULL_DOT, height: FULL_DOT, borderRadius: FULL_DOT / 2, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  connector: { width: 2, flex: 1, marginVertical: spacing.xxs, borderRadius: 1 },
  fullTexts: { flex: 1, gap: 2, paddingBottom: spacing.lg },
  fullHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: spacing.sm },
});
