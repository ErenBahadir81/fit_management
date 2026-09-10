import React, { useCallback, useEffect, useRef, useState } from "react";
import { Modal, StyleSheet, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";
import type { FoodDTO, Meal } from "@fitfloow/core";
import { haptic } from "../../../lib/haptics";
import { useTheme } from "../../../theme/ThemeProvider";
import { absoluteFill, radii, spacing } from "../../../theme/tokens";
import { Button } from "../../../ui/Button";
import { EmptyState } from "../../../ui/EmptyState";
import { Header } from "../../../ui/Header";
import { Surface } from "../../../ui/Surface";
import { Text } from "../../../ui/Text";
import { Floo } from "../../../mascot/Floo";
import { BARCODE_TYPES, CAMERA_SUPPORTED } from "../scan/camera";
import { useBarcodeLookup } from "../useNutrition";
import { FoodDetail } from "./FoodDetail";

export interface BarcodeScannerProps {
  meal: Meal;
  onAdd: (input: { food: FoodDTO; grams: number; meal: Meal }) => void;
  onManual: () => void;
  onClose: () => void;
  adding?: boolean;
}

type Phase = { kind: "scanning" } | { kind: "looking"; code: string } | { kind: "found"; food: FoodDTO } | { kind: "missing"; code: string };

/** Full-screen barcode reader: point at the pack, get the food, set the grams. */
export function BarcodeScanner({ meal: initialMeal, onAdd, onManual, onClose, adding }: BarcodeScannerProps) {
  const { colors } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<Phase>({ kind: "scanning" });
  const [meal, setMeal] = useState<Meal>(initialMeal);
  const lookup = useBarcodeLookup();
  const busy = useRef(false);

  useEffect(() => {
    if (CAMERA_SUPPORTED && permission && !permission.granted && permission.canAskAgain) void requestPermission();
  }, [permission, requestPermission]);

  const onScanned = useCallback(
    ({ data }: { data: string }) => {
      if (busy.current || !data) return;
      busy.current = true;
      void haptic.medium();
      setPhase({ kind: "looking", code: data });
      lookup
        .mutateAsync(data)
        .then((food) => setPhase(food ? { kind: "found", food } : { kind: "missing", code: data }))
        .catch(() => setPhase({ kind: "missing", code: data }))
        .finally(() => {
          busy.current = false;
        });
    },
    [lookup]
  );

  const canScan = CAMERA_SUPPORTED && Boolean(permission?.granted) && phase.kind === "scanning";

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent testID="barcode-modal">
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        {canScan ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
            onBarcodeScanned={onScanned}
          />
        ) : null}

        <View style={styles.overlay} pointerEvents="box-none">
          <Header compact title="Barkod" left={{ icon: "close", label: "Kapat", onPress: onClose, testID: "barcode-close" }} style={styles.header} />

          {phase.kind === "scanning" && CAMERA_SUPPORTED && permission?.granted ? (
            <Animated.View entering={FadeIn.duration(240)} style={styles.guideWrap} pointerEvents="none">
              <View style={[styles.guide, { borderColor: colors.onPrimary }]} />
              <Text variant="label" style={[styles.hint, { color: colors.onPrimary }]}>
                Barkodu çerçeveye al
              </Text>
            </Animated.View>
          ) : null}

          {!CAMERA_SUPPORTED || (permission && !permission.granted) ? (
            <EmptyState
              illustration={<Floo mood="think" size="m" />}
              title={CAMERA_SUPPORTED ? "Kamera izni gerekli" : "Barkod telefonda çalışır"}
              body={CAMERA_SUPPORTED ? "Barkod okumak için kamera iznine ihtiyacım var." : "Bu ekranda barkod okuyamıyorum ama ürünü elle girebilirsin."}
              action={CAMERA_SUPPORTED && permission?.canAskAgain ? { label: "İzin ver", onPress: () => void requestPermission(), icon: "camera" } : { label: "Elle gir", onPress: onManual, icon: "create-outline" }}
            />
          ) : null}

          {phase.kind === "looking" ? (
            <Animated.View entering={FadeIn.duration(160)} style={styles.center}>
              <Surface elevated radius="md" style={styles.status}>
                <Text variant="bodyStrong" tabular>
                  {phase.code}
                </Text>
                <Text variant="caption" color="inkMuted">
                  Ürün aranıyor…
                </Text>
              </Surface>
            </Animated.View>
          ) : null}
        </View>

        {phase.kind === "found" ? (
          <Animated.View entering={FadeInUp.springify().damping(18).stiffness(220)} style={styles.bottom}>
            <Surface elevated radius="sheet" style={styles.card}>
              <FoodDetail
                testID="barcode-detail"
                name={phase.food.name}
                brand={phase.food.brand ?? null}
                per100g={phase.food.per100g}
                servings={phase.food.servings}
                initialGrams={phase.food.defaultServingG}
                meal={meal}
                onMealChange={setMeal}
                onAdd={(grams) => onAdd({ food: phase.food, grams, meal })}
                adding={adding}
              />
            </Surface>
          </Animated.View>
        ) : null}

        {phase.kind === "missing" ? (
          <Animated.View entering={FadeInUp.springify().damping(18).stiffness(220)} style={styles.bottom}>
            <Surface elevated radius="sheet" style={styles.card}>
              <Text variant="title">Bu barkodu tanımıyorum</Text>
              <Text variant="body" color="inkMuted" tabular>
                {phase.code} için kayıt bulamadım. Değerleri elle girebilirsin.
              </Text>
              <View style={styles.actions}>
                <Button label="Elle gir" icon="create-outline" onPress={onManual} full />
                <Button label="Tekrar tara" variant="secondary" onPress={() => setPhase({ kind: "scanning" })} full />
              </View>
            </Surface>
          </Animated.View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  overlay: { ...absoluteFill, paddingHorizontal: spacing.gutter, paddingTop: spacing.huge },
  header: { marginBottom: spacing.xl },
  guideWrap: { alignItems: "center", gap: spacing.md, marginTop: spacing.huge },
  guide: { width: "82%", aspectRatio: 1.6, maxWidth: 340, borderRadius: radii.md, borderWidth: 2, opacity: 0.9 },
  hint: { opacity: 0.9 },
  center: { alignItems: "center", marginTop: spacing.xxl },
  status: { paddingVertical: spacing.md, paddingHorizontal: spacing.lg, alignItems: "center", gap: 2 },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0 },
  card: { padding: spacing.gutter, paddingBottom: spacing.xxxl, gap: spacing.md },
  actions: { gap: spacing.sm, marginTop: spacing.xs },
});
