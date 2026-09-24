import React from "react";
import { StyleSheet, View } from "react-native";
import { spacing } from "../../../theme/tokens";
import { TextField } from "../../../ui/TextField";
import type { Onboarding } from "../useOnboarding";

/** Stage 1a — one question: what should Floo call you? */
export function HelloStep({ o }: { o: Onboarding }) {
  const [touched, setTouched] = React.useState(false);
  return (
    <View style={styles.stack}>
      <TextField
        label="Adın"
        value={o.draft.account.displayName}
        onChangeText={(displayName) => o.patch((d) => ({ ...d, account: { ...d.account, displayName } }))}
        onBlur={() => setTouched(true)}
        error={touched ? o.errors.displayName : undefined}
        hint="Floo sana böyle seslenecek."
        icon="displayName"
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
        returnKeyType="next"
        autoFocus
        onSubmitEditing={o.next}
        testID="ob-displayName"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.lg },
});
