import React from "react";
import { StyleSheet, View } from "react-native";
import type { Meal } from "@fitfloow/core";
import { spacing } from "../../../theme/tokens";
import { ListRow } from "../../../ui/ListRow";
import { Sheet } from "../../../ui/Sheet";
import { Text } from "../../../ui/Text";
import { MEAL_LABEL } from "../model/meals";

export type AddAction = "scan" | "search" | "recent" | "barcode" | "manual";

export interface AddSheetProps {
  meal: Meal;
  onPick: (action: AddAction) => void;
  onClose: () => void;
}

const ACTIONS: { action: AddAction; label: string; hint: string; icon: "camera" | "search" | "time-outline" | "barcode-outline" | "create-outline" }[] = [
  { action: "scan", label: "Tara (kamera)", hint: "Fotoğrafla tanı, saniyeler içinde", icon: "camera" },
  { action: "search", label: "Ara", hint: "Yemek adıyla bul", icon: "search" },
  { action: "recent", label: "Son kullanılanlar", hint: "Sık yediklerin", icon: "time-outline" },
  { action: "barcode", label: "Barkod", hint: "Paketli ürünü okut", icon: "barcode-outline" },
  { action: "manual", label: "Elle gir", hint: "Kendi değerlerini yaz", icon: "create-outline" },
];

/** The FAB / per-meal "+" menu. One tap, five ways in. */
export function AddSheet({ meal, onPick, onClose }: AddSheetProps) {
  return (
    <Sheet open onDismiss={onClose}>
      <View style={styles.stack}>
        <Text variant="heading">{MEAL_LABEL[meal]} için ekle</Text>
        <View>
          {ACTIONS.map((a) => (
            <ListRow
              key={a.action}
              testID={`add-${a.action}`}
              label={a.label}
              hint={a.hint}
              icon={a.icon}
              onPress={() => onPick(a.action)} // the parent swaps in the next sheet (this one unmounts)
            />
          ))}
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({ stack: { gap: spacing.sm } });
