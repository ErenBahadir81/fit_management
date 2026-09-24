import React, { useMemo } from "react";
import { Platform, ScrollView, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent, type StyleProp, type ViewStyle } from "react-native";
import { FlashList, type FlashListProps, type ListRenderItem as FlashListRenderItem } from "@shopify/flash-list";
import { useScreenScroll } from "./Screen";

export type ListRenderItem<T> = FlashListRenderItem<T>;
export type ListProps<T> = Omit<FlashListProps<T>, "renderItem"> & {
  renderItem?: ListRenderItem<T> | null;
};

/**
 * The app's single list seam, so platform quirks are fixed here instead of in every screen.
 *
 * Native uses FlashList and its recycling. Web uses a plain scroller: FlashList lays cells out with
 * absolute positioning, which under react-native-web draws `ListEmptyComponent` on top of
 * `ListHeaderComponent` and leaves screens overlapping. Our lists are short (a few hundred rows at
 * most), so normal document flow on web costs nothing and removes a class of layout bugs.
 *
 * Related trap: react-native-web's ScrollView renders itself as a child of whatever element is
 * passed as `refreshControl`, so that element must forward `children` — see `ListRefreshControl`.
 */
function renderSlot(slot: React.ComponentType | React.ReactElement | null | undefined): React.ReactNode {
  if (!slot) return null;
  if (React.isValidElement(slot)) return slot;
  const C = slot as React.ComponentType;
  return <C />;
}

function ListInner<T>(rawProps: ListProps<T>, ref: React.Ref<unknown>) {
  // Inside a tab `Screen` the list's offset drives the top bar that keeps rows from sliding under
  // the corner Floo. Horizontal lists never do; the caller's own `onScroll` still runs.
  const screenScroll = useScreenScroll();
  const own = rawProps.onScroll;
  const onScroll = useMemo(
    () =>
      screenScroll && !rawProps.horizontal
        ? (e: NativeSyntheticEvent<NativeScrollEvent>) => {
            screenScroll(e);
            own?.(e);
          }
        : own,
    [own, rawProps.horizontal, screenScroll]
  );
  const props = onScroll === own ? rawProps : { ...rawProps, onScroll, scrollEventThrottle: rawProps.scrollEventThrottle ?? 16 };
  if (Platform.OS !== "web") return <FlashList<T> ref={ref as never} {...(props as FlashListProps<T>)} />;

  const {
    data,
    renderItem,
    keyExtractor,
    ListHeaderComponent,
    ListFooterComponent,
    ListEmptyComponent,
    ItemSeparatorComponent,
    contentContainerStyle,
    refreshControl,
    showsVerticalScrollIndicator,
    horizontal,
    testID,
    style,
    scrollEventThrottle,
  } = props as ListProps<T> & { style?: StyleProp<ViewStyle> };

  const items = (data ?? []) as readonly T[];
  const Separator = ItemSeparatorComponent as React.ComponentType | undefined;

  return (
    <ScrollView
      ref={ref as React.Ref<ScrollView>}
      testID={testID}
      horizontal={horizontal}
      style={[styles.grow, style]}
      contentContainerStyle={contentContainerStyle as StyleProp<ViewStyle>}
      refreshControl={refreshControl}
      showsVerticalScrollIndicator={showsVerticalScrollIndicator}
      keyboardShouldPersistTaps="handled"
      onScroll={props.onScroll}
      scrollEventThrottle={scrollEventThrottle}
    >
      {renderSlot(ListHeaderComponent as never)}
      {items.length === 0
        ? renderSlot(ListEmptyComponent as never)
        : items.map((item, index) => (
            <View key={keyExtractor ? keyExtractor(item, index) : String(index)}>
              {index > 0 && Separator ? <Separator /> : null}
              {renderItem ? renderItem({ item, index, target: "Cell", extraData: undefined } as never) : null}
            </View>
          ))}
      {renderSlot(ListFooterComponent as never)}
    </ScrollView>
  );
}

/** Generic-preserving forwardRef. */
export const List = React.forwardRef(ListInner) as <T>(props: ListProps<T> & { ref?: React.Ref<unknown> }) => React.ReactElement;

const styles = StyleSheet.create({
  /** minHeight 0 lets the scroller shrink inside a flex column instead of overflowing it. */
  grow: { flex: 1, minHeight: 0 },
});
