import { invoke } from "../utils/invoke";

export interface AuthState {
  is_authenticated: boolean;
  user_id: string | null;
}

export const ping = () => invoke<string>("ping");
export const getAuthState = () => invoke<AuthState>("get_auth_state");
export const startOAuth = (clientId: string) =>
  invoke<void>("start_oauth", { clientId });
export const logout = () => invoke<void>("logout");
