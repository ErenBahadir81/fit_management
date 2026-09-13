import React, { useRef } from "react";
import { StyleSheet, View, type TextInput } from "react-native";
import { spacing } from "../../../theme/tokens";
import { Text } from "../../../ui/Text";
import { TextField } from "../../../ui/TextField";
import { MIN_PASSWORD } from "../model";
import type { Onboarding } from "../useOnboarding";

/**
 * Name, handle, password. Errors only appear once a field has been touched, so an empty form is
 * an invitation rather than a list of complaints.
 */
export function AccountStep({ o }: { o: Onboarding }) {
  const [touched, setTouched] = React.useState<Record<string, boolean>>({});
  const userRef = useRef<TextInput>(null);
  const passRef = useRef<TextInput>(null);
  const show = (k: keyof typeof o.errors) => (touched[k] ? o.errors[k] : undefined);
  const touch = (k: string) => setTouched((t) => ({ ...t, [k]: true }));

  return (
    <View style={styles.stack}>
      <TextField
        label="Adın"
        value={o.draft.account.displayName}
        onChangeText={(displayName) => o.patch((d) => ({ ...d, account: { ...d.account, displayName } }))}
        onBlur={() => touch("displayName")}
        error={show("displayName")}
        hint="Floo sana böyle seslenecek."
        icon="displayName"
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
        returnKeyType="next"
        onSubmitEditing={() => userRef.current?.focus()}
        testID="ob-displayName"
      />
      <TextField
        ref={userRef}
        label="Kullanıcı adı"
        value={o.draft.account.username}
        onChangeText={(username) => o.patch((d) => ({ ...d, account: { ...d.account, username } }))}
        onBlur={() => touch("username")}
        error={show("username")}
        hint="Girişte bunu kullanacaksın."
        icon="username"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username-new"
        textContentType="username"
        returnKeyType="next"
        onSubmitEditing={() => passRef.current?.focus()}
        testID="ob-username"
      />
      <TextField
        ref={passRef}
        label="Şifre"
        value={o.password}
        onChangeText={o.setPassword}
        onBlur={() => touch("password")}
        error={show("password")}
        hint={`En az ${MIN_PASSWORD} karakter.`}
        icon="password"
        secure
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={o.next}
        testID="ob-password"
      />
      <Text variant="caption" color="inkSubtle">
        Ölçülerin ve planın yalnızca bu hesapta tutulur.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.lg },
});
