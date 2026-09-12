import React, { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import Animated, { FadeIn } from "react-native-reanimated";
import { useLocalSearchParams, useRouter } from "expo-router";
import { zMeal, type Meal } from "@fitfloow/core";
import { Floo } from "../../../mascot/Floo";
import { SpeechBubble } from "../../../mascot/SpeechBubble";
import { useMascot } from "../../../mascot/useMascot";
import { getApi } from "../../../lib/api";
import { todayKey, trHour } from "../../../lib/dates";
import { haptic } from "../../../lib/haptics";
import { useTheme } from "../../../theme/ThemeProvider";
import { absoluteFill, radii, spacing } from "../../../theme/tokens";
import { Button } from "../../../ui/Button";
import { EmptyState } from "../../../ui/EmptyState";
import { Header } from "../../../ui/Header";
import { Icon } from "../../../ui/Icon";
import { Pressable } from "../../../ui/Pressable";
import { Sheet } from "../../../ui/Sheet";
import { SuccessCheck } from "../../../ui/SuccessCheck";
import { Text } from "../../../ui/Text";
import { useToast } from "../../../ui/Toast";
import { mealForHour } from "../model/meals";
import { MIN_ANALYZE_MS, canSave, initialScanState, mapScanError, scanReducer } from "../model/scanMachine";
import { SearchSheet } from "../sheets/SearchSheet";
import { useAddEntries } from "../useNutrition";
import { AiThinking } from "./AiThinking";
import { ScanResults } from "./ScanResults";
import { CAMERA_SUPPORTED, scanUploadFrom } from "./camera";

const TICK_MS = 200;
const DONE_MS = 1100;

/** Full-screen scan flow: camera → AI theatre → results sheet → the day log. */
export function ScanScreen() {
  const router = useRouter();
  const toast = useToast();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ date?: string; meal?: string }>();
  const dateKey = typeof params.date === "string" && params.date.length === 10 ? params.date : todayKey();
  const parsedMeal = zMeal.safeParse(params.meal);
  const initialMeal: Meal = parsedMeal.success ? parsedMeal.data : mealForHour(trHour());

  const [state, dispatch] = useReducer(scanReducer, initialMeal, initialScanState);
  const [searchOpen, setSearchOpen] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const addEntries = useAddEntries(dateKey);
  const mascot = useMascot("scan");

  const showResults = state.phase === "results" || state.phase === "saving";

  useEffect(() => {
    if (CAMERA_SUPPORTED && permission && !permission.granted && permission.canAskAgain) void requestPermission();
  }, [permission, requestPermission]);

  /* The analyze run: the request, the minimum theatre duration and the status ticker. */
  useEffect(() => {
    if (state.phase !== "analyzing" || !state.photoUri) return;
    const controller = new AbortController();
    const min = setTimeout(() => dispatch({ type: "minElapsed" }), MIN_ANALYZE_MS);
    const ticker = setInterval(() => dispatch({ type: "tick", at: Date.now() }), TICK_MS);
    const uri = state.photoUri;
    void (async () => {
      try {
        const upload = await scanUploadFrom(uri);
        if (controller.signal.aborted) return;
        dispatch({ type: "result", result: await getApi().nutrition.scan(upload, controller.signal) });
      } catch (e) {
        if (!controller.signal.aborted) dispatch({ type: "failed", error: mapScanError(e) });
      }
    })();
    return () => {
      clearTimeout(min);
      clearInterval(ticker);
      controller.abort();
    };
  }, [state.phase, state.photoUri]);

  /* Success: let the check land, then drop back into the day. */
  useEffect(() => {
    if (state.phase !== "done") return;
    const t = setTimeout(() => router.back(), DONE_MS);
    return () => clearTimeout(t);
  }, [router, state.phase]);

  const onShutter = useCallback(async () => {
    if (state.phase !== "camera") return;
    dispatch({ type: "shutter" });
    void haptic.medium();
    try {
      const photo = await camera.current?.takePictureAsync({ quality: 0.6, skipProcessing: true });
      if (photo?.uri) dispatch({ type: "captured", uri: photo.uri, at: Date.now() });
      else dispatch({ type: "retake" });
    } catch {
      dispatch({ type: "retake" });
      toast.show({ message: "Fotoğrafı alamadım, tekrar dene.", kind: "error" });
    }
  }, [state.phase, toast]);

  const onPickFromGallery = useCallback(async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.6, allowsEditing: false });
      const uri = res.canceled ? null : res.assets?.[0]?.uri;
      if (uri) dispatch({ type: "captured", uri, at: Date.now() });
    } catch {
      toast.show({ message: "Galeriyi açamadım.", kind: "error" });
    }
  }, [toast]);

  const onSave = useCallback(async () => {
    if (!canSave(state)) return;
    dispatch({ type: "save" });
    try {
      await addEntries.mutateAsync(
        state.items.map((i) => ({
          meal: state.meal,
          grams: i.grams,
          foodId: i.foodId,
          custom: { name: i.name, per100g: i.per100g },
          source: "scan" as const,
          scanId: state.scanId,
        }))
      );
      dispatch({ type: "saved" }); // the SuccessCheck that follows fires the success haptic
    } catch {
      dispatch({ type: "saveFailed", message: "Kaydedemedim, tekrar dener misin?" });
      toast.show({ message: "Kaydedemedim, tekrar dener misin?", kind: "error" });
    }
  }, [addEntries, state, toast]);

  const close = useCallback(() => router.back(), [router]);

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]} testID="scan-screen">
      {state.phase === "camera" || state.phase === "capturing" ? (
        <CameraStage
          cameraRef={camera}
          granted={Boolean(permission?.granted)}
          canAskAgain={Boolean(permission?.canAskAgain)}
          onRequest={() => void requestPermission()}
          onShutter={() => void onShutter()}
          onGallery={() => void onPickFromGallery()}
          onClose={close}
          busy={state.phase === "capturing"}
          mascotText={mascot.text}
        />
      ) : null}

      {state.phase === "analyzing" ? <AiThinking uri={state.photoUri} statusIndex={state.statusIndex} /> : null}

      {(showResults || state.phase === "error" || state.phase === "done") && state.photoUri ? (
        <Image source={{ uri: state.photoUri }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
      ) : null}
      {showResults || state.phase === "error" ? <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]} /> : null}

      {state.phase !== "camera" && state.phase !== "capturing" ? (
        <View style={styles.topBar} pointerEvents="box-none">
          <Header compact title="" left={{ icon: "close", label: "Kapat", onPress: close, testID: "scan-close" }} />
        </View>
      ) : null}

      {state.phase === "error" ? (
        <Animated.View entering={FadeIn.duration(200)} style={styles.errorWrap}>
          <View style={[styles.errorCard, { backgroundColor: colors.surface }]}>
            <EmptyState
              compact
              illustration={<Floo mood="worried" size="m" />}
              title="Tanıyamadım"
              body={state.error?.message ?? "Bir şeyler ters gitti."}
              action={{ label: "Yemek ara", onPress: () => setSearchOpen(true), icon: "search" }}
            />
            <Button testID="scan-error-retake" label="Tekrar çek" variant="secondary" icon="camera" onPress={() => dispatch({ type: "retake" })} full />
          </View>
        </Animated.View>
      ) : null}

      {state.phase === "done" ? (
        <Animated.View entering={FadeIn.duration(200)} style={styles.done} testID="scan-done">
          <View style={[styles.doneCard, { backgroundColor: colors.surface }]}>
            <SuccessCheck size={72} />
            <Floo mood="cheer" size="s" />
            <Text variant="title" align="center">
              Öğüne eklendi
            </Text>
          </View>
        </Animated.View>
      ) : null}

      {/*
        One sheet at a time. Stacking the search sheet on top left gorhom's "switch" stack unable to
        restore the minimised results sheet on web, so the user came back to a bare photo with their
        whole scan gone. Swapping them keeps the state and re-presents the results on the way back.
      */}
      {showResults && !searchOpen ? (
        <Sheet open enablePanDownToClose={false}>
          <ScanResults
            items={state.items}
            meal={state.meal}
            mock={state.mock}
            notFood={state.notFood}
            saving={state.phase === "saving"}
            onGrams={(key, grams) => dispatch({ type: "setGrams", key, grams })}
            onRemove={(key) => dispatch({ type: "removeItem", key })}
            onMeal={(meal) => dispatch({ type: "setMeal", meal })}
            onAddMore={() => setSearchOpen(true)}
            onSave={() => void onSave()}
            onRetake={() => dispatch({ type: "retake" })}
          />
        </Sheet>
      ) : null}

      {searchOpen ? (
        <SearchSheet
          meal={state.meal}
          onClose={() => setSearchOpen(false)}
          onAdd={(input) => {
            const per100g = input.food?.per100g ?? input.custom?.per100g;
            if (!per100g) return;
            dispatch({
              type: "addItem",
              item: { name: input.food?.name ?? input.custom?.name ?? "Yiyecek", confidence: null, grams: input.grams, per100g, foodId: input.food?.id ?? null },
            });
            dispatch({ type: "setMeal", meal: input.meal });
            setSearchOpen(false);
          }}
        />
      ) : null}
    </View>
  );
}

interface CameraStageProps {
  cameraRef: React.RefObject<CameraView | null>;
  granted: boolean;
  canAskAgain: boolean;
  onRequest: () => void;
  onShutter: () => void;
  onGallery: () => void;
  onClose: () => void;
  busy: boolean;
  mascotText: string;
}

/** The live preview with the framing guide, shutter and gallery pick (gallery-only on web). */
function CameraStage({ cameraRef, granted, canAskAgain, onRequest, onShutter, onGallery, onClose, busy, mascotText }: CameraStageProps) {
  const { colors } = useTheme();
  const live = CAMERA_SUPPORTED && granted;

  return (
    <View style={styles.root} testID="scan-camera">
      {live ? <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" /> : <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }]} />}

      <View style={styles.topBar} pointerEvents="box-none">
        <Header compact title="" left={{ icon: "close", label: "Kapat", onPress: onClose, testID: "scan-close" }} />
      </View>

      {live ? (
        <>
          <View pointerEvents="none" style={styles.guideWrap}>
            <View style={[styles.guide, { borderColor: colors.onPrimary }]} />
          </View>
          <View pointerEvents="none" style={styles.mascotLine}>
            <Floo mood="happy" size="s" testID="scan-camera-floo" />
            <SpeechBubble text={mascotText} tail="left" />
          </View>
        </>
      ) : (
        <View style={styles.permission}>
          <EmptyState
            illustration={<Floo mood="think" size="m" />}
            title={CAMERA_SUPPORTED ? "Kamera izni gerekli" : "Kamera burada yok"}
            body={CAMERA_SUPPORTED ? "Tabağını tanıyabilmem için kameraya ihtiyacım var." : "Bu ekranda kamera açılmıyor ama galerinden bir fotoğraf seçebilirsin."}
            action={CAMERA_SUPPORTED && canAskAgain ? { label: "İzin ver", onPress: onRequest, icon: "camera" } : undefined}
          />
        </View>
      )}

      <View style={styles.controls}>
        <Pressable testID="scan-gallery" onPress={onGallery} haptic="select" accessibilityLabel="Galeriden seç" style={[styles.sideBtn, { backgroundColor: colors.surfaceMuted }]}>
          <Icon name="images-outline" size={22} color="ink" />
        </Pressable>

        {live ? (
          <Pressable
            testID="scan-shutter"
            onPress={onShutter}
            disabled={busy}
            haptic="none"
            minTarget={false}
            accessibilityLabel="Fotoğraf çek"
            style={[styles.shutter, { borderColor: colors.onPrimary }]}
          >
            <View style={[styles.shutterCore, { backgroundColor: colors.onPrimary }]} />
          </Pressable>
        ) : (
          <Button testID="scan-gallery-primary" label="Galeriden seç" icon="images-outline" onPress={onGallery} />
        )}

        <View style={styles.sideBtn} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: { position: "absolute", top: spacing.huge, left: spacing.gutter, right: spacing.gutter },
  guideWrap: { ...absoluteFill, alignItems: "center", justifyContent: "center" },
  guide: { width: "78%", aspectRatio: 1, maxWidth: 340, borderRadius: radii.card, borderWidth: 2, opacity: 0.75 },
  mascotLine: { position: "absolute", left: spacing.gutter, right: spacing.gutter, bottom: 168, flexDirection: "row", alignItems: "flex-end", gap: spacing.sm },
  permission: { flex: 1, justifyContent: "center" },
  controls: { position: "absolute", left: 0, right: 0, bottom: spacing.huge, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xxxl },
  sideBtn: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  shutter: { width: 78, height: 78, borderRadius: 39, borderWidth: 4, alignItems: "center", justifyContent: "center" },
  shutterCore: { width: 60, height: 60, borderRadius: 30 },
  errorWrap: { ...absoluteFill, justifyContent: "flex-end", padding: spacing.gutter },
  errorCard: { borderRadius: radii.sheet, padding: spacing.lg, gap: spacing.sm },
  done: { ...absoluteFill, alignItems: "center", justifyContent: "center", padding: spacing.gutter },
  doneCard: { borderRadius: radii.sheet, padding: spacing.xxl, alignItems: "center", gap: spacing.md, minWidth: 220 },
});
