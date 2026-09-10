import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import type { BodySummary } from "@fitfloow/core";
import { todayKey } from "../../../lib/dates";
import { fmtKg } from "../../../lib/format";
import { spacing } from "../../../theme/tokens";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { Icon } from "../../../ui/Icon";
import { Stepper } from "../../../ui/Stepper";
import { Text } from "../../../ui/Text";
import { weighInDefault } from "../bodyMath";
import { BODY_HEIGHTS } from "../BodySkeleton";
import { useQuickWeighIn } from "../useBody";

const fmtWeight = (v: number) => fmtKg(v, 1);
const SAVED_MS = 1800;

/** Inline one-tap weigh-in: stepper prefilled with the last weight, "Kaydet", optimistic chart point. */
export function QuickWeighIn({ summary }: { summary: BodySummary }) {
  const today = todayKey();
  const todays = summary.latestWeighIn?.dateKey === today ? summary.latestWeighIn : null;
  const [value, setValue] = useState(() => weighInDefault(summary));
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mutation = useQuickWeighIn();

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const save = useCallback(() => {
    mutation.mutate(
      { weightKg: value },
      {
        onSuccess: () => {
          setSaved(true);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => setSaved(false), SAVED_MS);
        },
      }
    );
  }, [mutation, value]);

  return (
    <Card variant="muted" style={styles.min} testID="quick-weighin">
      <View style={styles.head}>
        <Icon name="scale-outline" size={16} color={todays ? "success" : "primary"} />
        <Text variant="label" color="inkMuted" tabular>
          {todays ? `Bugün tartıldın · ${fmtKg(todays.weightKg)}` : "Bugünkü tartı"}
        </Text>
      </View>
      <View style={styles.row}>
        <Stepper value={value} onChange={setValue} step={0.1} min={25} max={400} format={fmtWeight} label="Kilo" testID="weighin-stepper" />
        <Button
          label={saved ? "Kaydedildi" : todays ? "Güncelle" : "Kaydet"}
          icon={saved ? "checkmark" : undefined}
          onPress={save}
          loading={mutation.isPending}
          disabled={saved}
          testID="weighin-save"
          style={styles.btn}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  min: { minHeight: BODY_HEIGHTS.weighIn, justifyContent: "center" },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.xs + 2 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md, marginTop: spacing.md },
  btn: { minWidth: 104 },
});
