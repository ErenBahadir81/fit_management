import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import type { ProgramDTO } from "@fitfloow/core";
import { useTheme } from "../../../theme/ThemeProvider";
import { radii, spacing } from "../../../theme/tokens";
import { Button } from "../../../ui/Button";
import { Icon } from "../../../ui/Icon";
import { Pressable } from "../../../ui/Pressable";
import { Sheet, SheetActions, type SheetRef } from "../../../ui/Sheet";
import { Text } from "../../../ui/Text";
import { Toggle } from "../../../ui/Toggle";
import { canResumePlanned, dayChoices } from "../lib/plan";
import { KIND_ICON } from "./TodayHero";

export interface OtherDayChoice {
  dayId: string;
  resumePlanned: boolean;
}

export interface OtherDaySheetProps {
  sheetRef: React.RefObject<SheetRef | null>;
  program: Pick<ProgramDTO, "mode" | "days">;
  /** The day the plan had for today (the pointer, or today's weekday). */
  plannedDayId: string | null;
  busy?: boolean;
  /** Mark the chosen day as done today (`logDay`). */
  onLog: (choice: OtherDayChoice) => void;
  /** Open the logger on the chosen day, to log its sets. */
  onStart: (choice: OtherDayChoice) => void;
  /** Only move the pointer there, nothing logged (`jump`). */
  onJump: (dayId: string) => void;
}

/**
 * "Bugün başka bir şey yaptım": pick the day you actually did. The cycle continues after that day
 * — or, with "İdmanı kaçırdım, sıraya geri koy", the day you missed stays next. The days are a
 * two-column grid so even a 14-day cycle fits one sheet on a small phone.
 */
export function OtherDaySheet({ sheetRef, program, plannedDayId, busy, onLog, onStart, onJump }: OtherDaySheetProps) {
  const { colors } = useTheme();
  const [chosen, setChosen] = useState<string | null>(null);
  const [resume, setResume] = useState(false);
  const choices = dayChoices(program, plannedDayId);
  const picked = choices.find((c) => c.day.id === chosen) ?? null;
  const resumable = canResumePlanned(program, plannedDayId, chosen);
  const planned = choices.find((c) => c.planned)?.day ?? null;
  const choice = picked ? { dayId: picked.day.id, resumePlanned: resumable && resume } : null;
  const reset = () => {
    setChosen(null);
    setResume(false);
  };

  return (
    <Sheet ref={sheetRef} title="Bugün başka bir şey yaptım" onDismiss={reset}>
      <View style={styles.body} testID="other-day-sheet">
        <Text variant="body" color="inkMuted">
          Bugün yaptığın günü seç. Program o günün ardından devam eder.
        </Text>
        <View style={styles.grid}>
          {choices.map((c, index) => {
            const selected = c.day.id === chosen;
            return (
              <Pressable
                key={c.day.id}
                onPress={() => setChosen(c.day.id)}
                haptic="select"
                testID={`other-day-${index}`}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`${c.position}, ${c.day.title}${c.day.kind === "rest" ? ", dinlenme günü" : ""}${c.planned ? ", bugün planlanan" : ""}`}
                style={[
                  styles.tile,
                  { backgroundColor: selected ? colors.primarySoft : colors.surfaceMuted, borderColor: selected ? colors.primary : "transparent" },
                ]}
              >
                <Icon icon={KIND_ICON[c.day.kind]} size={18} color={selected ? "primary" : "inkMuted"} />
                <View style={styles.texts}>
                  <Text variant="caption" color="inkMuted" numberOfLines={1}>
                    {c.planned ? `${c.position} · plandaki` : c.position}
                  </Text>
                  <Text variant="bodyStrong" numberOfLines={1}>
                    {c.day.title}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        {resumable && planned ? (
          <View style={[styles.resume, { backgroundColor: colors.surfaceMuted }]}>
            <View style={styles.texts}>
              <Text variant="bodyStrong">İdmanı kaçırdım, sıraya geri koy</Text>
              <Text variant="caption" color="inkMuted">
                «{planned.title}» yarın yine sırada olur.
              </Text>
            </View>
            <Toggle value={resume} onChange={setResume} testID="resume-planned" accessibilityLabel="İdmanı kaçırdım, sıraya geri koy" />
          </View>
        ) : null}

        <SheetActions>
          {picked && picked.day.kind !== "rest" ? (
            <Button label="Setleriyle kaydet" variant="secondary" icon="list-outline" disabled={!choice || busy} onPress={() => choice && onStart(choice)} style={styles.grow} testID="other-start" />
          ) : null}
          <Button label="Yaptım" variant="primary" icon="check" disabled={!choice} loading={busy} onPress={() => choice && onLog(choice)} style={styles.grow} testID="other-log" />
        </SheetActions>
        {picked && !picked.planned ? (
          <Button
            label="Kaydetmeden buradan devam et"
            variant="ghost"
            size="sm"
            icon="reorder"
            disabled={busy}
            onPress={() => onJump(picked.day.id)}
            testID="other-jump"
            accessibilityHint="Sırayı düzeltir, bugüne kayıt eklemez"
          />
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.lg },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  tile: {
    flexBasis: "48%",
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 56,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1.5,
  },
  texts: { flex: 1, gap: 2 },
  resume: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderRadius: radii.md },
  grow: { flex: 1 },
});
