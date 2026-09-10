import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { spacing } from "../../../theme/tokens";
import { Button } from "../../../ui/Button";
import { Chip } from "../../../ui/Chip";
import { Sheet, SheetActions, type SheetRef } from "../../../ui/Sheet";
import { Text } from "../../../ui/Text";

export const SKIP_REASONS = ["Yorgunum", "Zamanım yok", "Hastayım", "Ağrım var", "Bugün dinleniyorum"] as const;

export interface SkipSheetProps {
  sheetRef: React.RefObject<SheetRef | null>;
  dayTitle: string;
  busy?: boolean;
  onConfirm: (reason: string | undefined) => void;
  onCancel: () => void;
}

/** "Atla" confirmation: one tap to pick a reason (optional), one to confirm. */
export function SkipSheet({ sheetRef, dayTitle, busy, onConfirm, onCancel }: SkipSheetProps) {
  const [reason, setReason] = useState<string | null>(null);
  return (
    <Sheet ref={sheetRef} title="Bugünü atla">
      <View style={styles.body} testID="skip-sheet">
        <Text variant="body" color="inkMuted">
          «{dayTitle}» bugünlük atlanacak. Program kaldığı yerden devam eder, sıra kaymaz.
        </Text>
        <View style={styles.chips}>
          {SKIP_REASONS.map((r) => (
            <Chip key={r} label={r} selected={reason === r} onPress={() => setReason((v) => (v === r ? null : r))} testID={`skip-reason-${r}`} />
          ))}
        </View>
        <SheetActions>
          <Button label="Vazgeç" variant="ghost" onPress={onCancel} style={styles.grow} testID="skip-cancel" />
          <Button label="Atla" variant="secondary" icon="play-skip-forward" loading={busy} onPress={() => onConfirm(reason ?? undefined)} style={styles.grow} testID="skip-confirm" />
        </SheetActions>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.lg },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  grow: { flex: 1 },
});
