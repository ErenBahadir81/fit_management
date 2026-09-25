import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { FlooModel } from "../../../mascot/model";
import { spacing } from "../../../theme/tokens";
import { Button } from "../../../ui/Button";
import { Screen } from "../../../ui/Screen";
import { Text } from "../../../ui/Text";

/** Floo's first wave waits for the page to settle, so it is seen rather than half-missed. */
const FIRST_WAVE_MS = 450;

/**
 * The first screen anyone sees. Floo, the name, one promise, two doors.
 *
 * The promise is the product's actual thesis — that it tells you *when you arrive where* — so the
 * session that follows reads as Floo collecting exactly what he needs to keep it.
 */
export function WelcomeStep({ onCreate, onSignIn }: { onCreate: () => void; onSignIn: () => void }) {
  const reduce = useReducedMotion();
  const [wave, setWave] = useState<{ name: "wave"; key: number } | null>(null);
  useEffect(() => {
    if (reduce) return;
    const t = setTimeout(() => setWave({ name: "wave", key: 1 }), FIRST_WAVE_MS);
    return () => clearTimeout(t);
  }, [reduce]);

  return (
    <Screen tabBar={false} edges={["top", "bottom"]} contentStyle={styles.content} testID="onboarding-welcome">
      <View style={styles.hero}>
        <FlooModel size={160} lod="full" mood="happy" gesture={wave} testID="welcome-floo" />
        <Text variant="hero" align="center" accessibilityRole="header">
          FitFloow
        </Text>
        <Text variant="title" color="inkMuted" align="center" style={styles.promise}>
          Ölçünü al, hedefini seç. Ne zaman nereye varacağını gün gün göstereyim.
        </Text>
      </View>
      <View style={styles.actions}>
        <Button label="Hesap oluştur" onPress={onCreate} full size="lg" testID="welcome-create" />
        <Button label="Giriş yap" onPress={onSignIn} variant="ghost" full size="lg" testID="welcome-signin" />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: "space-between", paddingVertical: spacing.xxl },
  hero: { flex: 1, justifyContent: "center", alignItems: "center", gap: spacing.lg },
  promise: { maxWidth: 320 },
  actions: { gap: spacing.sm },
});
