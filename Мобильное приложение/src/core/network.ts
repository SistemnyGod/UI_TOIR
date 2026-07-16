import NetInfo from "@react-native-community/netinfo";
import { canAttemptServerConnection } from "@/core/networkPolicy";

export async function hasUsableNetwork() {
  const state = await NetInfo.fetch();

  return canAttemptServerConnection(state);
}
