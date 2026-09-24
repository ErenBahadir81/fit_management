import React, { useCallback, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View, type LayoutChangeEvent } from "react-native";
import { useTheme } from "../../theme";
import { FlooEffects } from "./Effects";
import { FlooModel } from "./FlooModel";
import { MOODS, TRIGGERS, type Mood, type Trigger } from "./params";
import { useFlooModel } from "./useFlooModel";

const FLOO_SIZE = 240;
const HYDRATION_STEPS = [0, 25, 50, 75, 100] as const;

/**
 * A bench for the parametric Floo: every mood, every trigger, the hydration axis and live gaze
 * tracking, with the raw state printed underneath. This is where the character is judged — if it
 * looks robotic here it will look robotic in the app.
 */
export function Playground() {
  const { colors } = useTheme();
  const floo = useFlooModel("idle", 0.75);
  const [reduced, setReduced] = useState(false);
  const stage = useRef({ w: 1, h: 1 });

  const onStageLayout = useCallback((e: LayoutChangeEvent) => {
    stage.current = { w: e.nativeEvent.layout.width || 1, h: e.nativeEvent.layout.height || 1 };
  }, []);

  /** Pointer / touch anywhere on the stage becomes a −1…1 gaze relative to the stage centre. */
  const track = useCallback(
    (x: number, y: number) => {
      const { w, h } = stage.current;
      const nx = Math.max(-1, Math.min(1, (x - w / 2) / (w / 2)));
      const ny = Math.max(-1, Math.min(1, (y - h / 2) / (h / 2)));
      floo.setLook({ x: nx, y: ny });
    },
    [floo]
  );
  const release = useCallback(() => floo.setLook({ x: 0, y: 0 }), [floo]);

  const s = styles;
  const chip = (active: boolean) => [
    s.chip,
    { backgroundColor: active ? colors.primary : colors.surface, borderColor: active ? colors.primary : colors.border },
  ];
  const chipText = (active: boolean) => [s.chipText, { color: active ? colors.onPrimary : colors.ink }];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={s.page}>
      <Text style={[s.title, { color: colors.ink }]}>Floo — damla modeli</Text>

      <View
        testID="floo-stage"
        style={[s.stage, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}
        onLayout={onStageLayout}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => track(e.nativeEvent.locationX, e.nativeEvent.locationY)}
        onResponderMove={(e) => track(e.nativeEvent.locationX, e.nativeEvent.locationY)}
        onResponderRelease={release}
        {...(Platform.OS === "web"
          ? {
              // Only while the pointer is actually over the stage — tracking it anywhere on the
              // page leaves the pupils parked in a corner long after the cursor has gone.
              onPointerMove: (e: any) => {
                const n = e.nativeEvent ?? e;
                const { w, h } = stage.current;
                const x = n.offsetX ?? n.locationX ?? 0;
                const y = n.offsetY ?? n.locationY ?? 0;
                if (x < 0 || y < 0 || x > w || y > h) {
                  release();
                  return;
                }
                track(x, y);
              },
              onPointerLeave: release,
              onPointerCancel: release,
              onPointerUp: release,
            }
          : null)}
      >
        <FlooEffects kind={reduced ? null : floo.effect.kind} nonce={floo.effect.nonce} layer="back" />
        <Pressable onPress={() => floo.fire("tap")} testID="floo-tap" style={s.stageInner}>
          <FlooModel
            testID="floo-model"
            size={FLOO_SIZE}
            animate={!reduced}
            {...floo.flooProps}
            look={reduced ? { x: 0, y: 0 } : floo.look}
          />
        </Pressable>
        <FlooEffects kind={reduced ? null : floo.effect.kind} nonce={floo.effect.nonce} layer="front" />
      </View>

      <Text style={[s.label, { color: colors.inkMuted }]}>Duygu</Text>
      <View style={s.row}>
        {MOODS.map((m: Mood) => (
          <Pressable key={m} testID={`mood-${m}`} onPress={() => floo.setMood(m)} style={chip(floo.mood === m)}>
            <Text style={chipText(floo.mood === m)}>{m}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={[s.label, { color: colors.inkMuted }]}>Tetikleyici</Text>
      <View style={s.row}>
        {TRIGGERS.map((t: Trigger) => (
          <Pressable key={t} testID={`trigger-${t}`} onPress={() => floo.fire(t)} style={chip(false)}>
            <Text style={chipText(false)}>{t}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={[s.label, { color: colors.inkMuted }]}>Hidrasyon</Text>
      <View style={s.row}>
        {HYDRATION_STEPS.map((n) => {
          const active = Math.round(floo.hydration * 100) === n;
          return (
            <Pressable key={n} testID={`hydration-${n}`} onPress={() => floo.setHydration(n / 100)} style={chip(active)}>
              <Text style={chipText(active)}>{n}%</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={[s.row, s.switchRow]}>
        <Text style={[s.label, { color: colors.inkMuted, marginTop: 0 }]}>Azaltılmış hareket</Text>
        <Switch testID="reduced-motion" value={reduced} onValueChange={setReduced} />
      </View>

      <Text testID="state-readout" style={[s.readout, { color: colors.inkSubtle, borderColor: colors.border }]}>
        {JSON.stringify({
          mood: floo.mood,
          hydration: Math.round(floo.hydration * 100) / 100,
          look: { x: Math.round(floo.look.x * 100) / 100, y: Math.round(floo.look.y * 100) / 100 },
          trigger: floo.trigger,
          reduced,
        })}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20, gap: 4, paddingBottom: 60 },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 12 },
  stage: {
    height: 400,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  stageInner: { alignItems: "center", justifyContent: "center" },
  label: { fontSize: 13, fontWeight: "600", marginTop: 18, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.6 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  switchRow: { marginTop: 18, justifyContent: "space-between" },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, borderWidth: 1 },
  chipText: { fontSize: 13, fontWeight: "600" },
  readout: { marginTop: 22, fontSize: 12, borderWidth: 1, borderRadius: 12, padding: 12, lineHeight: 18 },
});

export default Playground;
