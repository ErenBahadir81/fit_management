import React, { useCallback, useRef, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { ApiClientError } from "@fitfloow/api-client";
import type { Mood } from "@fitfloow/core";
import { getApi } from "../../lib/api";
import { env } from "../../lib/env";
import { haptic } from "../../lib/haptics";
import { Floo } from "../../mascot/Floo";
import { useTheme } from "../../theme/ThemeProvider";
import { spacing } from "../../theme/tokens";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { Chip } from "../../ui/Chip";
import { Screen } from "../../ui/Screen";
import { Text } from "../../ui/Text";
import { TextField } from "../../ui/TextField";
import { useSession } from "./session";

function messageFor(e: unknown): string {
  if (e instanceof ApiClientError) {
    if (e.status === 401) return "Kullanıcı adı veya şifre hatalı.";
    if (e.status === 429) return "Çok fazla deneme. Biraz bekleyip tekrar dene.";
    if (e.isNetwork) return "Bağlantı kurulamadı. İnterneti kontrol et.";
    return e.message || "Bir şeyler ters gitti.";
  }
  return "Bir şeyler ters gitti.";
}

/** Login: Floo idle, two fields, one action. Errors shake the card (skipped under reduced motion). */
export function LoginScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const signIn = useSession((s) => s.signIn);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ username?: string; password?: string; form?: string }>({});
  const [loading, setLoading] = useState(false);
  const [mood, setMood] = useState<Mood>("happy");
  const passwordRef = useRef<TextInput>(null);
  const shake = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  const fail = useCallback(
    (next: typeof errors) => {
      setErrors(next);
      setMood("worried");
      void haptic.error();
      if (!reduce) shake.value = withSequence(withTiming(-10, { duration: 50 }), withTiming(10, { duration: 50 }), withTiming(-6, { duration: 50 }), withTiming(6, { duration: 50 }), withTiming(0, { duration: 60 }));
    },
    [reduce, shake]
  );

  const submit = useCallback(async () => {
    const u = username.trim();
    const next: typeof errors = {};
    if (!u) next.username = "Kullanıcı adını gir.";
    if (!password) next.password = "Şifreni gir.";
    if (next.username || next.password) return fail(next);
    setErrors({});
    setLoading(true);
    setMood("think");
    try {
      const res = await getApi().auth.login(u, password);
      setMood("cheer");
      void haptic.success();
      signIn(res.user);
      router.replace("/(tabs)");
    } catch (e) {
      fail({ form: messageFor(e) });
    } finally {
      setLoading(false);
    }
  }, [username, password, fail, signIn, router]);

  return (
    <Screen keyboard tabBar={false} edges={["top", "bottom"]} contentStyle={styles.content}>
      <View style={styles.hero}>
        <Floo mood={mood} size="l" testID="login-floo" />
        <Text variant="hero" align="center">
          FitFloow
        </Text>
        <Text variant="body" color="inkMuted" align="center">
          Hoş geldin. Kaldığımız yerden devam edelim mi?
        </Text>
      </View>
      <Animated.View style={shakeStyle}>
        <Card style={styles.card}>
          <TextField
            label="Kullanıcı adı"
            value={username}
            onChangeText={(t) => {
              setUsername(t);
              if (errors.username) setErrors((e) => ({ ...e, username: undefined }));
            }}
            error={errors.username}
            icon="person-outline"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            textContentType="username"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            testID="login-username"
          />
          <TextField
            ref={passwordRef}
            label="Şifre"
            value={password}
            onChangeText={(t) => {
              setPassword(t);
              if (errors.password) setErrors((e) => ({ ...e, password: undefined }));
            }}
            error={errors.password}
            icon="lock-closed-outline"
            secure
            autoComplete="password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={submit}
            testID="login-password"
          />
          {errors.form ? (
            <Text variant="label" tone="danger" accessibilityLiveRegion="assertive">
              {errors.form}
            </Text>
          ) : null}
          <Button label="Giriş yap" onPress={submit} loading={loading} full size="lg" testID="login-submit" />
        </Card>
      </Animated.View>
      {env.fakeApi && (
        <View style={styles.demo}>
          <Chip label="Demo: eren / eren123" tone="primary" icon="sparkles" onPress={() => {
            setUsername("eren");
            setPassword("eren123");
          }} />
        </View>
      )}
      <Text variant="caption" color="inkSubtle" align="center" style={{ color: colors.inkSubtle }}>
        Hesabın yoksa yöneticinle iletişime geç.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: "center", gap: spacing.xxl },
  hero: { alignItems: "center", gap: spacing.sm },
  card: { gap: spacing.lg },
  demo: { alignItems: "center" },
});
