type MutationSyncRequester = () => void;

let requester: MutationSyncRequester | null = null;

export function registerMutationSyncRequester(nextRequester: MutationSyncRequester) {
  requester = nextRequester;
  return () => {
    if (requester === nextRequester) {
      requester = null;
    }
  };
}

export function requestSyncAfterMutation() {
  requester?.();
}
