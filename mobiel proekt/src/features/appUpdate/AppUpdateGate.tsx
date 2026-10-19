import { useEffect, type ReactNode } from "react";
import { AppState, Modal, View } from "react-native";

import { runAfterFirstRender } from "@/core/afterFirstRender";
import { AppUpdateBanner } from "@/features/appUpdate/AppUpdateBanner";
import { UpdateRequiredScreen } from "@/features/appUpdate/UpdateRequiredScreen";
import { isAppUpdateBlockingState, shouldShowAppUpdateBanner } from "@/services/appUpdate/appUpdateController";
import { appUpdateController, useAppUpdateState } from "@/services/appUpdate/appUpdateService";

/**
 * Checks for updates on start and on return to the foreground (throttled),
 * floats the optional-update banner and covers the app with the blocking
 * screen when this build is no longer supported. The app underneath stays
 * mounted, so no in-memory form state or local data is lost.
 */
export function AppUpdateGate({ children }: { children: ReactNode }) {
  const state = useAppUpdateState();

  useEffect(() => {
    // The start check is a network call; let the first screen draw first.
    const cancelStartCheck = runAfterFirstRender(() => { void appUpdateController.checkForUpdates("start"); });
    const subscription = AppState.addEventListener("change", (appState) => {
      if (appState === "active") void appUpdateController.checkForUpdates("foreground");
    });
    return () => {
      cancelStartCheck();
      subscription.remove();
    };
  }, []);

  const blocking = isAppUpdateBlockingState(state);
  return (
    <View style={{ flex: 1 }}>
      {children}
      {!blocking && shouldShowAppUpdateBanner(state) ? <AppUpdateBanner state={state} /> : null}
      <Modal
        visible={blocking}
        animationType="fade"
        statusBarTranslucent
        // The hardware back button must not dismiss a required update.
        onRequestClose={() => undefined}
      >
        {blocking ? <UpdateRequiredScreen state={state} /> : null}
      </Modal>
    </View>
  );
}
