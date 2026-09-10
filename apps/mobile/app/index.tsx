import { Redirect } from "expo-router";
import { useSession } from "../src/features/auth/session";

/** Entry: land on the tabs when signed in, otherwise on login. */
export default function Index() {
  const status = useSession((s) => s.status);
  return <Redirect href={status === "signedIn" ? "/(tabs)" : "/(auth)/login"} />;
}
