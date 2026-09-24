// Reine Entscheidung: Wird die Begrüßung gezeigt?
//
// Sie liegt als Overlay über allem, auch über einem geöffneten Termin. Wer über
// einen geteilten Link kommt, sah deshalb „Willkommen" statt des Termins — im
// Browser traf das jeden neuen Besucher, weil dort nie ein Merker gesetzt ist.
// Auf dem Handy fiel es nicht auf: Wer die App installiert hat, hat sie längst
// einmal geöffnet.

export interface OnboardingState {
  /** Merker aus dem Speicher: Begrüßung wurde schon einmal weggetippt. */
  seen: boolean;
  /** Die App wurde über einen Termin-Link geöffnet. */
  hasDeepLink: boolean;
}

/**
 * Die Begrüßung erscheint nur beim allerersten Start ohne Termin-Link.
 *
 * Ein Link gewinnt: Er hat ein Ziel, die Begrüßung hat nur Zeit. Sie kommt beim
 * nächsten Start ohne Link — der Merker wird hier bewusst nicht gesetzt.
 */
export function shouldShowOnboarding(state: OnboardingState): boolean {
  if (state.seen) return false;
  if (state.hasDeepLink) return false;
  return true;
}
