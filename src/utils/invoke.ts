/**
 * utils/invoke.ts — Thin wrapper around Tauri's `invoke` that intercepts
 * AUTH_EXPIRED errors and fires a global "octave-auth-expired" window event.
 *
 * App.tsx listens for that event and navigates back to the login screen so
 * the user never gets stuck in a "try again" loop after a Spotify token
 * expiry.
 *
 * All screens should import `invoke` from here instead of directly from
 * `@tauri-apps/api/core`.  The API is identical — this is a drop-in
 * replacement with one extra side-effect on auth failures.
 */

import { invoke as tauriInvoke } from "@tauri-apps/api/core";

export async function invoke<T>(
  cmd: string,
  args?: Record<string, unknown>
): Promise<T> {
  try {
    return await (args !== undefined
      ? tauriInvoke<T>(cmd, args)
      : tauriInvoke<T>(cmd));
  } catch (err) {
    const msg = String(err);
    if (msg.startsWith("AUTH_EXPIRED")) {
      window.dispatchEvent(new CustomEvent("octave-auth-expired"));
    }
    throw err;
  }
}
