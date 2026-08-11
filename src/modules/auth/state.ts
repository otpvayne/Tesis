export interface AuthActionState {
  error: string | null;
}

export const authInitialState: AuthActionState = { error: null };
