import React from "react";
import { Text } from "react-native";
import { fireEvent, screen } from "@testing-library/react-native";
import { renderUI } from "../helpers";
import { List } from "../../src/ui/List";
import { Screen } from "../../src/ui/Screen";

const DATA = ["a", "b", "c"];
const row = ({ item }: { item: string }) => <Text>{item}</Text>;
const scrollTo = (y: number) => ({ nativeEvent: { contentOffset: { x: 0, y }, contentSize: { width: 390, height: 2000 }, layoutMeasurement: { width: 390, height: 800 } } });

describe("Screen top bar", () => {
  test("a list screen gets the top bar too: invisible at rest, opaque as soon as the list scrolls", async () => {
    const own = jest.fn();
    await renderUI(
      <Screen scroll={false}>
        <List testID="list" data={DATA} renderItem={row} onScroll={own} />
      </Screen>
    );
    const bar = screen.getByTestId("screen-top-bar");
    expect(bar).toHaveAnimatedStyle({ opacity: 0 });
    await fireEvent.scroll(screen.getByTestId("list"), scrollTo(40));
    expect(screen.getByTestId("screen-top-bar")).toHaveAnimatedStyle({ opacity: 1 });
    // The list's own handler still runs.
    expect(own).toHaveBeenCalledTimes(1);
  });

  test("a horizontal list does not drive the bar", async () => {
    await renderUI(
      <Screen scroll={false}>
        <List testID="chips" horizontal data={DATA} renderItem={row} />
      </Screen>
    );
    await fireEvent.scroll(screen.getByTestId("chips"), scrollTo(40));
    expect(screen.getByTestId("screen-top-bar")).toHaveAnimatedStyle({ opacity: 0 });
  });

  test("screens without the tab bar (modals) have no top bar", async () => {
    await renderUI(
      <Screen scroll={false} tabBar={false}>
        <List testID="list" data={DATA} renderItem={row} />
      </Screen>
    );
    expect(screen.queryByTestId("screen-top-bar")).toBeNull();
    await renderUI(
      <Screen tabBar={false}>
        <Text>modal</Text>
      </Screen>
    );
    expect(screen.queryByTestId("screen-top-bar")).toBeNull();
  });

  test("a scrolling screen keeps its bar", async () => {
    await renderUI(
      <Screen testID="scroller">
        <Text>content</Text>
      </Screen>
    );
    expect(screen.getByTestId("screen-top-bar")).toHaveAnimatedStyle({ opacity: 0 });
  });
});
