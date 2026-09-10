import React, { useEffect } from "react";
import { Text } from "react-native";
import { screen, waitFor } from "@testing-library/react-native";
import { renderUI } from "../../../__tests__/helpers";
import { useToast } from "../../ui/Toast";

function Boom() {
  const toast = useToast();
  useEffect(() => {
    toast.show({ message: "Muz eklendi", kind: "success" });
  }, [toast]);
  return <Text>hi</Text>;
}

test("B: toast alone", async () => {
  await renderUI(<Boom />);
  await waitFor(() => expect(screen.getByText("Muz eklendi")).toBeTruthy());
});
