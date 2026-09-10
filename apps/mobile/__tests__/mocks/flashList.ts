/**
 * FlashList v2 under Jest: the recycler measures a 0×0 parent in the test renderer and renders no
 * rows. Mirror `@shopify/flash-list/jestSetup.js` from a test file:
 *
 *   jest.mock("@shopify/flash-list", () => require("../../mocks/flashList").flashListMock());
 *   jest.mock("@shopify/flash-list/dist/recyclerview/utils/measureLayout", () => require("../../mocks/flashList").measureLayoutMock());
 */
export function flashListMock() {
  const actual = jest.requireActual("@shopify/flash-list");
  // v2.0.x no longer exports `RecyclerView` (FlashList *is* the recycler); keep the real component.
  return { ...actual, FlashList: actual.RecyclerView ?? actual.FlashList };
}

export function measureLayoutMock() {
  const actual = jest.requireActual("@shopify/flash-list/dist/recyclerview/utils/measureLayout");
  const box = (height: number) => ({ x: 0, y: 0, width: 400, height });
  return {
    ...actual,
    measureParentSize: jest.fn(() => box(2000)),
    measureFirstChildLayout: jest.fn(() => box(2000)),
    measureItemLayout: jest.fn(() => box(80)),
  };
}
