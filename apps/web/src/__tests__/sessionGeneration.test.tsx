import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ me: vi.fn(), login: vi.fn(), logout: vi.fn(), changePassword: vi.fn(), token: "initial" }));
vi.mock("../repositories/sessionRepository", () => ({
  createSessionRepository: () => mock,
  getStoredSessionToken: () => mock.token,
  clearStoredSessionToken: () => { mock.token = ""; },
  setStoredSessionToken: (token: string) => { mock.token = token; },
  getStoredRememberMe: () => false, setStoredLastLogin: () => {},
}));
import { useSession } from "../hooks/useSession";
const user = { id: "new-user", login: "new", displayName: "New user", roles: [], permissions: [] };
const session = { user, accessToken: "new-token", expiresAt: "2027-01-01T00:00:00Z" };
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason: unknown) => void; const promise = new Promise<T>((r, j) => { resolve = r; reject = j; }); return { promise, resolve, reject }; }
beforeEach(() => { vi.clearAllMocks(); mock.token = "initial"; mock.me.mockResolvedValue(user); mock.login.mockResolvedValue(session); mock.logout.mockResolvedValue(undefined); });

it("a late failed session check cannot clear a newer login token", async () => {
  const old = deferred<typeof user>(); mock.me.mockReturnValueOnce(old.promise);
  const hook = renderHook(() => useSession("api"));
  await act(async () => { expect(await hook.result.current.login("new", "password")).toBe(true); });
  await act(async () => { old.reject(new Error("old unauthorized response")); });
  expect(mock.token).toBe("new-token"); expect(hook.result.current.user).toEqual(user); expect(hook.result.current.status).toBe("authenticated");
});

it("logout clears the session immediately and its late completion preserves a new login", async () => {
  const oldLogout = deferred<void>(); mock.logout.mockReturnValueOnce(oldLogout.promise);
  const hook = renderHook(() => useSession("api")); await waitFor(() => expect(hook.result.current.status).toBe("authenticated"));
  let pending!: Promise<void>;
  act(() => { pending = hook.result.current.logout(); });
  expect(hook.result.current.user).toBeNull(); expect(mock.token).toBe("");
  await act(async () => { await hook.result.current.login("new", "password"); });
  await act(async () => { oldLogout.resolve(); await pending; });
  expect(mock.token).toBe("new-token"); expect(hook.result.current.user).toEqual(user);
});

it("an old login response cannot restore the session after logout", async () => {
  const oldLogin = deferred<typeof session>(); mock.login.mockReturnValueOnce(oldLogin.promise);
  const hook = renderHook(() => useSession("api")); await waitFor(() => expect(hook.result.current.status).toBe("authenticated"));
  let pending!: Promise<boolean>;
  act(() => { pending = hook.result.current.login("old", "password"); });
  await act(async () => { await hook.result.current.logout(); });
  await act(async () => { oldLogin.resolve(session); expect(await pending).toBe(false); });
  expect(mock.token).toBe(""); expect(hook.result.current.user).toBeNull();
});

it("an unmounted login cannot write credentials into a later application instance", async () => {
  const oldLogin = deferred<typeof session>(); mock.login.mockReturnValueOnce(oldLogin.promise);
  const hook = renderHook(() => useSession("api")); await waitFor(() => expect(hook.result.current.status).toBe("authenticated"));
  let pending!: Promise<boolean>;
  act(() => { pending = hook.result.current.login("old", "password"); });
  hook.unmount(); mock.token = "later-session";
  await act(async () => { oldLogin.resolve(session); expect(await pending).toBe(false); });
  expect(mock.token).toBe("later-session");
});
