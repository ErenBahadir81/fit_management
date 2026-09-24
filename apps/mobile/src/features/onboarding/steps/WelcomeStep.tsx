import React from "react";
import { StyleSheet, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { Floo } from "../../../mascot";
import { spacing } from "../../../theme/tokens";
import { Button } from "../../../ui/Button";
import { Screen } from "../../../ui/Screen";
import { Text } from "../../../ui/Text";

/**
 * The first screen anyone sees. Floo, the name, one promise, two doors.
 *
 * The promise is the product's actual thesis — that it tells you *when you arrive where* — so the
 * rest of the flow reads as the app collecting exactly what it needs to keep it.
 */
export function WelcomeStep({ onCreate, onSignIn }: { onCreate: () => void; onSignIn: () => void }) {
  const reduce = useReducedMotion();
  return (
    <Screen tabBar={false} edges={["top", "bottom"]} contentStyle={styles.content} testID="onboarding-welcome">
      <View style={styles.hero}>
        <Floo mood="happy" size="l" animate={!reduce} testID="welcome-floo" />
        <Text variant="hero" align="center">
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
  content: { flexGrow: 1, justifyContent: "space-between", paddingVertical: spacing.huge },
  hero: { flex: 1, justifyContent: "center", alignItems: "center", gap: spacing.lg },
  promise: { maxWidth: 320 },
  actions: { gap: spacing.sm },
});
