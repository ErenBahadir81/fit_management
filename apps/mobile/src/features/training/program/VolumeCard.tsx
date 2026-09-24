import React, { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import type { MuscleVolume, ProgramVolume } from "@fitfloow/core";
import { spacing } from "../../../theme/tokens";
import { Card } from "../../../ui/Card";
import { Segmented } from "../../../ui/Segmented";
import { Text } from "../../../ui/Text";
import { doneRows, plannedRows } from "../lib/volume";
import { VolumeBars } from "../volume/VolumeBars";

type Source = "plan" | "done";
const SOURCES = [
  { value: "plan" as const, label: "Program" },
  { value: "done" as const, label: "Son 7 gün" },
];

/**
 * Weekly sets per muscle on the continuous bands: what the program plans (default — the thing
 * you can change in the editor) or what the last seven days actually did.
 */
export function VolumeCard({ planned, done }: { planned: ProgramVolume | null | undefined; done: readonly MuscleVolume[] }) {
  const [source, setSource] = useState<Source>("plan");
  const rows = useMemo(() => (source === "plan" ? plannedRows(planned?.muscles ?? []) : doneRows(done)), [done, planned?.muscles, source]);
  if ((planned?.muscles.length ?? 0) === 0 && done.length === 0) return null;
  const inRange = rows.filter((r) => r.inRange).length;
  return (
    <Card style={styles.card} testID="volume-card">
      <View style={styles.head}>
        <Text variant="title">Haftalık hacim</Text>
        <Text variant="caption" color="inkMuted" tabular testID="volume-summary">
          {inRange}/{rows.length} kas önerilen aralıkta
        </Text>
      </View>
      <Segmented options={SOURCES} value={source} onChange={setSource} size="sm" testID="volume-source" />
      <VolumeBars key={source} rows={rows} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  head: { gap: 2 },
});
