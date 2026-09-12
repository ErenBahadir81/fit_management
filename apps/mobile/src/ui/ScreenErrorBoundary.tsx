import React from "react";
import { View, StyleSheet } from "react-native";
import { Text } from "./Text";
import { Button } from "./Button";
import { spacing } from "../theme/tokens";

interface Props {
  children: React.ReactNode;
  /** Shown in the fallback so a report says which screen broke. */
  name: string;
}
interface State {
  error: Error | null;
}

/**
 * Route-level boundary. Without one a render-time crash unmounts the screen and leaves a blank
 * page with nothing in the console — which is precisely how the Program and Vücut tabs failed
 * silently on web. Here the user gets an explanation and a retry, and the cause is always logged.
 */
export class ScreenErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error(`[${this.props.name}] ekran hatası:`, error?.message, error?.stack, info?.componentStack);
  }

  private retry = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={styles.wrap} testID={`screen-error-${this.props.name}`}>
        <Text variant="title">Bu ekran yüklenemedi</Text>
        <Text variant="body" color="inkMuted" style={styles.body}>
          Beklenmeyen bir hata oluştu. Tekrar denemek sorunu genelde çözer.
        </Text>
        <Text variant="caption" color="inkMuted" style={styles.detail} numberOfLines={4}>
          {this.state.error.message}
        </Text>
        <Button label="Tekrar dene" onPress={this.retry} />
      </View>
    );
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.gutter },
  body: { textAlign: "center" },
  detail: { textAlign: "center", opacity: 0.7 },
});
