// Ob die Begrüßung gezeigt wird; sie lag sonst über einem per Link geöffneten Termin.

export interface OnboardingState {
  /** Merker aus dem Speicher: Begrüßung wurde schon einmal weggetippt. */
  seen: boolean;
  /** Die App wurde über einen Termin-Link geöffnet. */
  hasDeepLink: boolean;
}

/** Nur beim ersten Start ohne Termin-Link; der Merker wird hier bewusst nicht gesetzt. */
export function shouldShowOnboarding(state: OnboardingState): boolean {
  if (state.seen) return false;
  if (state.hasDeepLink) return false;
  return true;
}
