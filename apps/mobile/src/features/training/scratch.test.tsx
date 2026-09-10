import { act, waitFor } from "@testing-library/react-native";
import { makeQueryClient, renderHookUI } from "../../../__tests__/helpers";
import { setApi } from "../../lib/api";
import { createFakeApi } from "../../lib/fake";
import { useProgram, useSkipDay } from "./queries";
const fs = require("fs");
const trace = (m: string) => fs.appendFileSync("/tmp/claude-0/trace.log", m + "\n");

jest.mock("expo-router", () => require("../../../__tests__/mocks/expo-router"));

test("scratch: mutate only", async () => {
  setApi(createFakeApi({ latencyMs: 0, signedIn: true }));
  const qc = makeQueryClient();
  const program = await renderHookUI(() => useProgram(), { queryClient: qc });
  await waitFor(() => expect(program.result.current.data).toBeTruthy());
  trace("loaded");
  const skip = await renderHookUI(() => useSkipDay(), { queryClient: qc });
  trace("hook ready");
  await act(async () => {
    skip.result.current.mutate("x");
  });
  trace("mutated");
  await waitFor(() => expect(skip.result.current.isSuccess).toBe(true));
  trace("done");
});
