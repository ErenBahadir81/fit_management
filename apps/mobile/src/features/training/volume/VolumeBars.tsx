import React, { memo, useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { interpolate, interpolateColor, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { RECOMMENDED_WEEKLY_SETS } from "@fitfloow/core";
import { useTheme } from "../../../theme/ThemeProvider";
import { springs, timing } from "../../../theme/motion";
import { radii, spacing } from "../../../theme/tokens";
import { Chip } from "../../../ui/Chip";
import { Icon } from "../../../ui/Icon";
import { Pressable } from "../../../ui/Pressable";
import { Text } from "../../../ui/Text";
import { fmtSets, VOLUME_AXIS_MAX, VOLUME_GUIDES, VOLUME_RAMP_INPUT, volumeRampOutput, type VolumeRow } from "../lib/volume";

const BAR_H = 8;
const RAMP_IN = [...VOLUME_RAMP_INPUT];

/**
 * One muscle's weekly sets on a 0–25 axis. The recommended 10–15 band is a tinted zone on the
 * track, so "am I in range" reads without a legend; the fill blends its colour continuously along
 * the bands. It moves only because the number moved (an edit in the editor), on a spring — or a
 * 150 ms timing under reduced motion. `snappy`, not `gentle`: it follows every stepper tap, and
 * a held stepper must not leave the bar trailing behind the number.
 */
export const VolumeBar = memo(function VolumeBar({ row, suggestion, onSuggest }: { row: VolumeRow; suggestion?: string | null; onSuggest?: (key: string) => void }) {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const sets = useSharedValue(row.sets);
  useEffect(() => {
    sets.value = reduce ? withTiming(row.sets, timing.reduced) : withSpring(row.sets, springs.snappy);
  }, [reduce, row.sets, sets]);

  const ramp = useMemo(() => volumeRampOutput(colors), [colors]);
  const fill = useAnimatedStyle(() => ({
    width: `${interpolate(sets.value, [0, VOLUME_AXIS_MAX], [0, 100], "clamp")}%`,
    backgroundColor: interpolateColor(Math.min(sets.value, VOLUME_AXIS_MAX), RAMP_IN, ramp),
  }));

  const a11y = `${row.name}, haftada ${fmtSets(row.sets)} set, ${row.word}`;
  return (
    <View style={styles.row} testID={`volume-${row.key}`} accessible accessibilityRole="progressbar" accessibilityLabel={a11y} accessibilityValue={{ min: 0, max: VOLUME_AXIS_MAX, now: Math.round(row.sets) }}>
      <View style={styles.head}>
        <Text variant="label" numberOfLines={1} style={styles.name}>
          {row.name}
        </Text>
        <Text variant="caption" color="inkMuted" tabular testID={`volume-${row.key}-value`}>
          {fmtSets(row.sets)} set · {row.word}
        </Text>
      </View>
      <View style={[styles.track, { backgroundColor: colors.ringTrack }]}>
        <View
          style={[
            styles.band,
            { left: `${VOLUME_GUIDES.recommended.from * 100}%`, width: `${(VOLUME_GUIDES.recommended.to - VOLUME_GUIDES.recommended.from) * 100}%`, backgroundColor: colors.successSoft },
          ]}
        />
        <Animated.View style={[styles.fill, fill]} />
      </View>
      {suggestion && onSuggest ? (
        <Pressable
          onPress={() => onSuggest(row.key)}
          haptic="select"
          minTarget={false}
          testID={`volume-suggest-${row.key}`}
          accessibilityLabel={`${row.name} için öneri: ${suggestion} ekle`}
          style={styles.suggest}
        >
          <Icon icon="add" size={14} color="primary" />
          <Text variant="caption" color="primary" numberOfLines={1}>
            Öneri: {suggestion}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
});

export interface VolumeBarsProps {
  rows: readonly VolumeRow[];
  /** Collapsed by default to the muscles that get any work (and anything that needs attention). */
  collapsible?: boolean;
  /** Suggested exercise name per muscle key (only under-trained muscles get one). */
  suggestions?: Readonly<Record<string, string>>;
  onSuggest?: (key: string) => void;
  testID?: string;
}

/** A stack of `VolumeBar`s with the band legend and a "show all 17" toggle. */
export function VolumeBars({ rows, collapsible = true, suggestions, onSuggest, testID = "volume-bars" }: VolumeBarsProps) {
  const { colors } = useTheme();
  const [all, setAll] = useState(false);
  const worked = rows.filter((r) => r.sets > 0.05);
  const shown = !collapsible || all || worked.length === 0 ? rows : worked;
  const hidden = rows.length - shown.length;
  return (
    <View style={styles.list} testID={testID}>
      <View style={styles.legend}>
        <View style={[styles.swatch, { backgroundColor: colors.successSoft, borderColor: colors.success }]} />
        <Text variant="caption" color="inkMuted">
          Önerilen: haftada {RECOMMENDED_WEEKLY_SETS.min}–{RECOMMENDED_WEEKLY_SETS.max} set
        </Text>
      </View>
      {shown.map((row) => (
        <VolumeBar key={row.key} row={row} suggestion={suggestions?.[row.key] ?? null} onSuggest={onSuggest} />
      ))}
      {collapsible && (hidden > 0 || all) && worked.length > 0 && worked.length < rows.length ? (
        <Chip
          label={all ? "Sadece çalışan kaslar" : `+${hidden} kas daha`}
          size="sm"
          icon={all ? "chevron-up" : "chevron-down"}
          onPress={() => setAll((v) => !v)}
          testID="volume-toggle"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  row: { gap: spacing.xs + 2 },
  head: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: spacing.sm },
  name: { flexShrink: 1 },
  track: { height: BAR_H, borderRadius: radii.pill, overflow: "hidden" },
  band: { position: "absolute", top: 0, bottom: 0 },
  fill: { height: "100%", borderRadius: radii.pill },
  legend: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  swatch: { width: 14, height: 8, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth },
  suggest: { flexDirection: "row", alignItems: "center", gap: spacing.xs, alignSelf: "flex-start", paddingVertical: 2 },
});
