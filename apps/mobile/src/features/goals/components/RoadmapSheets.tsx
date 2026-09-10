import React, { forwardRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import type { Recalibration } from "@fitfloow/core";
import { fmtDelta, fmtInt } from "../../../lib/format";
import { useTheme } from "../../../theme/ThemeProvider";
import { radii, spacing } from "../../../theme/tokens";
import { Button } from "../../../ui/Button";
import { Divider } from "../../../ui/Divider";
import { Icon } from "../../../ui/Icon";
import { ListRow } from "../../../ui/ListRow";
import { Sheet, SheetActions, type SheetRef } from "../../../ui/Sheet";
import { Text } from "../../../ui/Text";

export interface RecalibrateSheetProps {
  result: Recalibration | null;
  onClose: () => void;
}

/** Explains what recalibration does and shows the measured-TDEE result. */
export const RecalibrateSheet = forwardRef<SheetRef, RecalibrateSheetProps>(function RecalibrateSheet({ result, onClose }, ref) {
  const { colors } = useTheme();
  return (
    <Sheet ref={ref} title="Yeniden kalibrasyon">
      <Text variant="body" color="inkMuted">
        Son üç haftada yediklerinle trend kilonun değişimini karşılaştırıp gerçek enerji harcamanı ölçtüm. Formül tahmini yerine bu değer kullanılır; plan bugünden itibaren yeniden hesaplanır.
      </Text>
      {result ? (
        <View style={[styles.result, { backgroundColor: result.applied ? colors.successSoft : colors.warningSoft }]} testID="recalibrate-result">
          <View style={styles.resultHead}>
            <Icon name={result.applied ? "checkmark-circle" : "information-circle"} size={20} color={result.applied ? "success" : "warning"} />
            <Text variant="bodyStrong" tone={result.applied ? "success" : "warning"}>
              {result.applied ? "Plan güncellendi" : "Henüz uygulanamadı"}
            </Text>
          </View>
          {result.reason ? (
            <Text variant="body" color="inkMuted">
              {result.reason}
            </Text>
          ) : null}
          <Divider style={styles.divider} />
          <Row label="Formül TDEE" value={`${fmtInt(result.tdeeFormula)} kcal`} />
          <Row label="Ölçülen TDEE" value={result.tdeeObserved === null ? "—" : `${fmtInt(result.tdeeObserved)} kcal`} strong />
          <Row label="Kullanılan TDEE" value={`${fmtInt(result.tdeeUsed)} kcal`} strong />
          <Row label="Veri penceresi" value={`${result.daysUsed} gün`} />
          <Row label="Ortalama alım" value={result.avgIntake === null ? "—" : `${fmtInt(result.avgIntake)} kcal`} />
          <Row label="Trend kilo değişimi" value={fmtDelta(result.weightDeltaKg, "kg", 2)} />
        </View>
      ) : null}
      <SheetActions>
        <Button label="Tamam" variant="secondary" onPress={onClose} full testID="recalibrate-done" />
      </SheetActions>
    </Sheet>
  );
});

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Text variant="body" color="inkMuted">
        {label}
      </Text>
      <Text variant={strong ? "bodyStrong" : "body"} tabular>
        {value}
      </Text>
    </View>
  );
}

export interface RoadmapMenuSheetProps {
  onEdit: () => void;
  onComplete: () => void;
  onAbandon: () => void;
  busy: boolean;
}

/** Overflow menu: edit target, mark complete, abandon (two-step, inline — never an alert). */
export const RoadmapMenuSheet = forwardRef<SheetRef, RoadmapMenuSheetProps>(function RoadmapMenuSheet({ onEdit, onComplete, onAbandon, busy }, ref) {
  const [confirm, setConfirm] = useState(false);
  return (
    <Sheet ref={ref} title="Hedef" onDismiss={() => setConfirm(false)}>
      <ListRow label="Hedefi düzenle" hint="Yağ oranı veya tempo değiştir; başlangıç korunur" icon="create-outline" onPress={onEdit} testID="menu-edit" />
      <ListRow label="Tamamlandı olarak işaretle" hint="Hedefe ulaştıysan planı kapat" icon="trophy-outline" onPress={onComplete} testID="menu-complete" />
      <ListRow label="Hedefi bırak" hint="Plan silinmez, geçmişte kalır" icon="close-circle-outline" destructive chevron={false} onPress={() => setConfirm(true)} testID="menu-abandon" />
      {confirm ? (
        <SheetActions>
          <Button label="Vazgeç" variant="ghost" onPress={() => setConfirm(false)} style={styles.flex} />
          <Button label="Evet, bırak" variant="danger" onPress={onAbandon} loading={busy} style={styles.flex} testID="menu-abandon-confirm" />
        </SheetActions>
      ) : null}
    </Sheet>
  );
});

const styles = StyleSheet.create({
  result: { borderRadius: radii.md, padding: spacing.lg, gap: spacing.sm },
  resultHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  divider: { marginVertical: spacing.xs },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 24 },
  flex: { flex: 1 },
});
