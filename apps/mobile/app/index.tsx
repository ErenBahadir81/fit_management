import { Redirect } from "expo-router";
import { useSession } from "../src/features/auth/session";
import { needsOnboarding } from "../src/features/onboarding/api";

/** Entry: the tabs when signed in and set up, the first-run flow when not, otherwise login. */
export default function Index() {
  const status = useSession((s) => s.status);
  const user = useSession((s) => s.user);
  if (status === "signedIn") return <Redirect href={needsOnboarding(user) ? "/(onboarding)" : "/(tabs)"} />;
  return <Redirect href="/(auth)/login" />;
}
