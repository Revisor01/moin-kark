import { useCallback, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ActivityIndicator,
  BackHandler,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useURL } from "expo-linking";
import { useLocalSearchParams } from "expo-router";
import { KIRCHSPIELE, eventParishes } from "@moinkark/shared";
import EventMap from "../components/EventMap";
import EventList from "../components/EventList";
import EventSheet from "../components/EventSheet";
import FilterBar from "../components/FilterBar";
import FilterSheet from "../components/FilterSheet";
import ProfileSheet from "../components/ProfileSheet";
import DraggableListSheet from "../components/DraggableListSheet";
import OnboardingOverlay from "../components/OnboardingOverlay";
import { useCategories, useEvents } from "../lib/hooks/useEvents";
import { useLocation } from "../lib/hooks/useLocation";
import { useSavedSync } from "../lib/hooks/useSavedSync";
import { useMapsApp, useReminderPref, useSavedEvents } from "../lib/store";
import { eventIdFromUrl } from "../lib/share";
import { shouldShowOnboarding } from "../lib/onboardingGate";
import {
  cancelForEvent,
  clearLastNotificationTap,
  ensurePermission,
  rescheduleAll,
  scheduleForEvent,
  useLastNotificationTap,
  type ReminderPref,
} from "../lib/reminders";
import { resolveBackPress } from "../lib/backNavigation";
import {
  DEFAULT_FILTERS,
  applyFilters,
  isInDithmarschen,
  isPast,
  sortByStart,
  type Bounds,
  type Filters,
} from "../lib/filters";
import { colors, glyph, mapColors, radius, sizes, spacing, text } from "../lib/theme";

const WIDE_BREAKPOINT = 900;

export default function Home() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isWide = width >= WIDE_BREAKPOINT;

  const { data, dataUpdatedAt, isLoading, isError, refetch, isFetching } = useEvents();
  const { data: categories } = useCategories();
  const { location, status: locStatus, request: requestLocation } = useLocation();
  const { mapsApp, setMapsApp } = useMapsApp();
  const { isSaved, toggle: rawToggleSave, saved, removeMany, loaded: savedLoaded } = useSavedEvents();
  const { pref: reminderPref, setPref: setReminderPref, loaded: reminderLoaded } = useReminderPref();

  // Standort-Anfrage: NICHT sofort beim Start. Beim allerersten Öffnen liegt das
  // Onboarding auf dem Bildschirm — der System-Dialog schöbe sich darüber, bevor
  // die App erklärt hat, wozu der Standort dient (schlechte Zustimmungsquote und
  // ein bekannter Stolperstein im App-Review). Darum erst, wenn das Onboarding
  // weg ist bzw. gar nicht gezeigt wird (s. ONBOARDING_KEY-Effekt / dismissOnboarding).

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [flyToken, setFlyToken] = useState(0);
  const [overviewToken, setOverviewToken] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [mapAreaHeight, setMapAreaHeight] = useState(0);
  // Anteil des Listen-Sheets, der unterhalb der Bildschirmkante geparkt ist
  // (Sheet hat feste Höhe und wird per translateY geschoben). Die Liste braucht
  // genau diesen Wert als Endabstand, sonst bleibt ihr Schluss unerreichbar.
  const [sheetHiddenPx, setSheetHiddenPx] = useState(0);
  const [didInitialZoom, setDidInitialZoom] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Kam die App über einen geteilten Termin-Link? Die Prüfung steht bewusst VOR
  // dem Onboarding-Effekt: Die Begrüßung liegt als Overlay über allem, auch über
  // dem geöffneten Termin (s. shouldShowOnboarding). Beide Quellen wie unten bei
  // `pendingEventId` — Karten-URL und der aus app/event/[id].tsx gereichte Pfad.
  const incomingUrl = useURL();
  const { event: eventParam } = useLocalSearchParams<{ event?: string }>();
  const hasDeepLink =
    (incomingUrl != null && eventIdFromUrl(incomingUrl) !== null) ||
    (typeof eventParam === "string" && /^\d+$/.test(eventParam));

  // Onboarding nur beim allerersten Start zeigen — und nie über einem Termin.
  const ONBOARDING_KEY = "kkd:onboardingSeen";
  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_KEY)
      .then((v) => {
        if (shouldShowOnboarding({ seen: !!v, hasDeepLink })) setShowOnboarding(true);
        else requestLocation(); // Kein Onboarding → direkt fragen wie bisher.
      })
      .catch(() => {});
  }, [requestLocation, hasDeepLink]);

  const dismissOnboarding = () => {
    setShowOnboarding(false);
    AsyncStorage.setItem(ONBOARDING_KEY, "1").catch(() => {});
    // Jetzt ist der Bildschirm frei und die Erklärung gelesen.
    requestLocation();
  };

  const allFeatures = data?.features ?? [];

  // Merken + lokale Erinnerung planen/abbrechen.
  // useCallback: geht als Prop an jede Listenkarte — eine bei jedem Render neue
  // Funktion hebelte dort das memo aus, und alle sichtbaren Karten renderten
  // bei jeder Positionsmeldung und jedem Minutentakt neu.
  const toggleSave = useCallback(
    async (id: number) => {
      const wasSaved = isSaved(id);
      rawToggleSave(id);
      if (wasSaved) {
        cancelForEvent(id).catch(() => {});
      } else if (reminderPref !== "off") {
        const f = allFeatures.find((x) => x.properties.id === id);
        if (f && (await ensurePermission())) scheduleForEvent(f, reminderPref).catch(() => {});
      }
    },
    [isSaved, rawToggleSave, reminderPref, allFeatures]
  );

  // Erinnerungs-Präferenz ändern → alle gemerkten Events neu planen.
  const onReminderPref = async (p: ReminderPref) => {
    setReminderPref(p);
    if (p !== "off") await ensurePermission();
    rescheduleAll(savedFeatures, p).catch(() => {});
  };

  // „Zu meinem Standort"-Button: Position holen + hinfliegen. Liegt der Standort außerhalb
  // Dithmarschens (ferner Tester/Reviewer, Urlauber von weit weg), NICHT ins Leere fliegen —
  // sonst filtert die Karten-Bounds die Event-Liste auf 0. Stattdessen auf die Übersicht.
  const onJumpToLocation = async () => {
    const loc = location ?? (await requestLocation());
    if (!loc) return;
    if (isInDithmarschen(loc)) setFlyToken((t) => t + 1);
    else setOverviewToken((t) => t + 1);
  };

  // Start-Ansicht: Sobald der Standort da ist, einmal dorthin zoomen.
  //
  // Vorher hing das an zwei Bedingungen, die es in der Praxis oft verhinderten:
  // Es musste ein Termin ≤ 8 km entfernt liegen (in dünn besetzten Wochen traf
  // das selbst in der eigenen Gemeinde nicht zu), und der Effekt lief nur, wenn
  // die Termine schon geladen waren — traf der Standort später ein, war
  // `didInitialZoom` längst gesetzt und die Karte blieb auf der Übersicht.
  // Jetzt entscheidet allein, ob der Standort in Dithmarschen liegt; außerhalb
  // bleibt die Übersicht, sonst flöge die Karte ins Leere und der
  // Kartenausschnitt filterte die Liste auf null.
  useEffect(() => {
    if (didInitialZoom || !location) return;
    if (isInDithmarschen(location)) setFlyToken((t) => t + 1);
    setDidInitialZoom(true);
  }, [location, didInitialZoom]);

  // Abgleich gemerkter Events gegen frische Netzdaten (entfällt / verschoben →
  // lokale Mitteilung, Erinnerungen nachziehen). Läuft bei jeder neuen Netzantwort.
  useSavedSync({
    features: allFeatures,
    meta: data?.meta,
    dataUpdatedAt,
    saved,
    savedLoaded,
    removeMany,
    reminderPref,
    reminderLoaded,
  });

  // Tap auf eine Mitteilung → zugehöriges Event öffnen (falls es noch existiert).
  // useLastNotificationResponse statt eines reinen Listeners: Bei Kaltstart über
  // eine Mitteilung trifft die Antwort ein, BEVOR Home gemountet ist — der
  // Listener verpasste sie, die App startete nur auf der Karte. Der Hook liest
  // beim Mount die zuletzt gespeicherte Antwort und hört danach weiter zu
  // (s. expo-notifications 56, useLastNotificationResponse).
  const lastNotificationResponse = useLastNotificationTap();
  useEffect(() => {
    if (!lastNotificationResponse) return;
    const id = lastNotificationResponse.notification.request.content.data?.eventId;
    if (typeof id === "number") setSelectedId(id);
    // Verbraucht: sonst öffnete dieselbe Antwort das Event bei einem späteren
    // Neu-Mount erneut, und ein zweiter Tipp auf dieselbe Mitteilung gälte als
    // unverändert.
    clearLastNotificationTap();
  }, [lastNotificationResponse]);

  // Geteilter Link (`…/?event=<id>`). `incomingUrl` und `eventParam` stehen
  // oben beim Onboarding — useURL liefert auch die Start-URL beim Kaltstart,
  // nicht nur spätere Aufrufe (dieselbe Falle wie oben bei den Mitteilungen).
  // Die ID wird erst gesetzt, wenn der Feed da ist und den Termin kennt; sonst
  // zeigte das Sheet auf ein Event, das es nicht gibt.
  const [pendingEventId, setPendingEventId] = useState<number | null>(null);
  useEffect(() => {
    if (!incomingUrl) return;
    const id = eventIdFromUrl(incomingUrl);
    if (id !== null) setPendingEventId(id);
  }, [incomingUrl]);
  // Zweiter Weg: aus app/event/[id].tsx weitergereicht. Faengt die App den
  // Universal Link ab, sieht sie den Pfad /event/<id> statt einer Karten-URL —
  // useURL allein greift dort nicht.
  useEffect(() => {
    if (typeof eventParam !== "string" || !/^\d+$/.test(eventParam)) return;
    setPendingEventId(Number(eventParam));
  }, [eventParam]);
  useEffect(() => {
    if (pendingEventId === null || allFeatures.length === 0) return;
    const known = allFeatures.some((f) => f.properties.id === pendingEventId);
    // Unbekannte ID (abgesagt, vorbei, Tippfehler): still verwerfen, die Karte
    // bleibt stehen. Ein Fehlerdialog hülfe hier niemandem weiter.
    if (known) setSelectedId(pendingEventId);
    setPendingEventId(null);
  }, [pendingEventId, allFeatures]);

  // Android-Zurücktaste: offene Sheets schließen statt die App in den
  // Hintergrund zu schicken. Reihenfolge s. lib/backNavigation.
  //
  // Nur Android: Im Web wirft `BackHandler.addEventListener` („not supported"),
  // auf iOS gibt es keine Hardware-Taste. Der Effekt läuft trotzdem auf jeder
  // Plattform — nur der Inhalt ist plattformabhängig, damit die Hook-Reihenfolge
  // gleich bleibt.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      const target = resolveBackPress({
        eventOpen: selectedId !== null,
        filtersOpen,
        profileOpen,
      });
      if (target === "event") setSelectedId(null);
      else if (target === "filters") setFiltersOpen(false);
      else if (target === "profile") setProfileOpen(false);
      return target !== null;
    });
    return () => sub.remove();
  }, [selectedId, filtersOpen, profileOpen]);

  // Das Listen-Sheet verdeckt den unteren Teil der Karte. Die Liste soll sich aber NUR auf den
  // SICHTBAREN Ausschnitt (über dem Sheet) beziehen → unteren Bounds-Anteil abschneiden.
  // 0.28 ≈ Sheet im Standard-Snap (MID, ~184px bei ~660px Kartenhöhe). Web hat kein Sheet → volle Bounds.
  const visibleBounds = useMemo<Bounds | null>(() => {
    if (!bounds || isWide) return bounds;
    const span = bounds.north - bounds.south;
    const frac = mapAreaHeight > 0 ? Math.min(0.5, 184 / mapAreaHeight) : 0.28;
    return { ...bounds, south: bounds.south + span * frac };
  }, [bounds, isWide, mapAreaHeight]);

  // Zeitscheibe für die Filter. Ohne die bliebe `now` auf dem Wert des letzten
  // Memo-Durchlaufs stehen: eine über Stunden offene App (Tablet auf dem Tisch)
  // zeigte abgelaufene Termine weiter an, weil reines Verstreichen von Zeit
  // sonst keinen Recompute auslöst. Eine Minute ist fein genug und billig.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNowTick(Date.now()), 60_000);
    return () => clearInterval(iv);
  }, []);

  // Bewusst OHNE `location` in den Dependencies: der Standort geht in keinen
  // Filter ein. Stünde er hier, liefe bei laufendem GPS-Watch (alle 25 m / 5 s)
  // ständig ein voller Filter- und Sortierdurchlauf samt Neu-Rendern der Liste.
  const filtered = useMemo(
    () => sortByStart(applyFilters(allFeatures, filters, { now: new Date(nowTick), bounds: visibleBounds })),
    [allFeatures, filters, visibleBounds, nowTick]
  );

  // Gemerkte Events als Feature-Liste (fürs Profil) — vergangene fliegen sofort raus.
  const savedFeatures = useMemo(
    () =>
      sortByStart(
        allFeatures.filter((f) => saved.has(f.properties.id) && !isPast(f))
      ),
    [allFeatures, saved]
  );

  // Counter zeigt nur künftige Likes. Solange die Daten noch nicht da sind,
  // fällt er auf die rohe Set-Größe zurück (besser als 0).
  const savedCount = allFeatures.length > 0 ? savedFeatures.length : saved.size;


  // Karten-Pins folgen denselben Filtern, aber NICHT dem Viewport (sonst verschwinden Pins
  // beim Zoomen). Nur die Liste folgt dem Ausschnitt.
  const mapFeatures = useMemo(
    () => applyFilters(allFeatures, filters, { now: new Date(nowTick) }),
    [allFeatures, filters, nowTick]
  );

  const categoryTitles = useMemo(
    () => (categories ?? []).slice(0, 14).map((c) => c.title),
    [categories]
  );

  // Nur Kirchspiele zeigen, die auch Events haben.
  const kirchspielOptions = useMemo(() => {
    const present = new Set(allFeatures.map((f) => f.properties.kirchspiel));
    return KIRCHSPIELE.filter((k) => present.has(k));
  }, [allFeatures]);

  // Gemeinden des gewählten Kirchspiels (alphabetisch). Leer = keine Gemeinde-Reihe.
  // Mehrfach zugeordnete Events steuern ALLE ihre Gemeinden bei — sonst fehlte
  // z.B. Weddingstedt, wenn dort nur Kirchspiel-weite Termine stattfinden.
  const gemeindeOptions = useMemo(() => {
    if (!filters.kirchspiel) return [];
    const set = new Set<string>();
    for (const f of allFeatures) {
      if (f.properties.kirchspiel === filters.kirchspiel) {
        for (const g of eventParishes(f.properties)) set.add(g);
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b, "de"));
  }, [allFeatures, filters.kirchspiel]);

  const selectedFeature = useMemo(
    () => allFeatures.find((f) => f.properties.id === selectedId) ?? null,
    [allFeatures, selectedId]
  );

  const header = (
    <View style={styles.header}>
      <View style={styles.headerText}>
        <Text style={styles.kicker}>Evangelische Kirche Dithmarschen</Text>
        <Text style={styles.h1}>Kirche. In deiner Nähe.</Text>
        <Text style={styles.sub}>
          {filtered.length} {filtered.length === 1 ? "Veranstaltung" : "Veranstaltungen"}
        </Text>
      </View>
      <TouchableOpacity
        style={styles.profileBtn}
        onPress={() => setProfileOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Profil"
      >
        <Text style={styles.profileIcon}>♥</Text>
        {savedCount > 0 ? (
          <View style={styles.profileBadge}>
            <Text style={styles.profileBadgeText}>{savedCount}</Text>
          </View>
        ) : null}
      </TouchableOpacity>
    </View>
  );

  const profileSheet = (
    <ProfileSheet
      visible={profileOpen}
      onClose={() => setProfileOpen(false)}
      mapsApp={mapsApp}
      onMapsApp={setMapsApp}
      reminderPref={reminderPref}
      onReminderPref={onReminderPref}
      savedFeatures={savedFeatures}
      onSelectEvent={setSelectedId}
      onToggleSave={toggleSave}
    />
  );

  if (isLoading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.loadingText}>Veranstaltungen werden geladen …</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.h1}>Nanu …</Text>
        <Text style={styles.errorText}>Die Veranstaltungen konnten nicht geladen werden.</Text>
        <TouchableOpacity style={styles.retry} onPress={() => refetch()} activeOpacity={0.85}>
          <Text style={styles.retryText}>Erneut versuchen</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // „Diese Woche“ ist der Standard → zählt NICHT als aktiver Filter (kein Badge dafür).
  const activeCount =
    (filters.date !== DEFAULT_FILTERS.date ? 1 : 0) +
    (filters.kirchspiel ? 1 : 0) +
    (filters.parish ? 1 : 0) +
    (filters.category ? 1 : 0);

  const filterBar = (
    <FilterBar
      onOpenFilters={() => setFiltersOpen(true)}
      activeCount={activeCount}
      onJumpToLocation={locStatus !== "denied" ? onJumpToLocation : undefined}
      highlightsOnly={filters.highlightsOnly}
      onToggleHighlights={() =>
        setFilters((f) => ({ ...f, highlightsOnly: !f.highlightsOnly }))
      }
    />
  );

  const filterSheet = (
    <FilterSheet
      visible={filtersOpen}
      onClose={() => setFiltersOpen(false)}
      date={filters.date}
      onDate={(d) => setFilters((f) => ({ ...f, date: d }))}
      kirchspiele={kirchspielOptions}
      activeKirchspiel={filters.kirchspiel}
      onKirchspiel={(k) => setFilters((f) => ({ ...f, kirchspiel: k, parish: null }))}
      gemeinden={gemeindeOptions}
      activeGemeinde={filters.parish}
      onGemeinde={(g) => setFilters((f) => ({ ...f, parish: g }))}
      categories={categoryTitles}
      activeCategory={filters.category}
      onCategory={(c) => setFilters((f) => ({ ...f, category: c }))}
      onReset={() => setFilters(DEFAULT_FILTERS)}
      resultCount={filtered.length}
    />
  );

  const map = (
    <EventMap
      features={mapFeatures}
      onSelect={setSelectedId}
      userLocation={location}
      onBoundsChange={setBounds}
      flyToUserToken={flyToken}
      flyToOverviewToken={overviewToken}
    />
  );

  if (isWide) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        {header}
        {/* Liste links, Karte rechts — die Liste ist der Einstieg, die Karte der
            große Anzeigebereich daneben. */}
        <View style={styles.wideRow}>
          <View style={styles.listPane}>
            {filterBar}
            <EventList features={filtered} selectedId={selectedId} onSelect={setSelectedId} isSaved={isSaved} onToggleSave={toggleSave} bottomInset={insets.bottom} onRefresh={refetch} refreshing={isFetching} />
          </View>
          <View style={styles.mapPane}>{map}</View>
        </View>
        {filterSheet}
        {profileSheet}
        <EventSheet
          feature={selectedFeature}
          onClose={() => setSelectedId(null)}
          mapsApp={mapsApp}
          isSaved={selectedFeature ? isSaved(selectedFeature.properties.id) : false}
          onToggleSave={toggleSave}
        />
        <OnboardingOverlay visible={showOnboarding} onDone={dismissOnboarding} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {header}
      <View
        style={styles.mapArea}
        onLayout={(e) => setMapAreaHeight(e.nativeEvent.layout.height)}
      >
        {map}
        {/* Schwebende Steuerleiste ÜBER der Karte (kein eigener Hintergrund) */}
        <View style={styles.floatingBar} pointerEvents="box-none">
          {filterBar}
        </View>
        {mapAreaHeight > 0 ? (
          <DraggableListSheet
            availableHeight={mapAreaHeight}
            bottomInset={insets.bottom}
            onHiddenBottomChange={setSheetHiddenPx}
          >
            {/* Endabstand = Safe Area + verdeckter Sheet-Anteil: als Scroll-Inhalt,
                nicht als Container-Padding — sonst sind die letzten Einträge
                nicht erreichbar. */}
            <EventList features={filtered} selectedId={selectedId} onSelect={setSelectedId} isSaved={isSaved} onToggleSave={toggleSave} bottomInset={insets.bottom + sheetHiddenPx} inSheet />
          </DraggableListSheet>
        ) : null}
      </View>
      {filterSheet}
      {profileSheet}
      <EventSheet
        feature={selectedFeature}
        onClose={() => setSelectedId(null)}
        mapsApp={mapsApp}
        isSaved={selectedFeature ? isSaved(selectedFeature.properties.id) : false}
        onToggleSave={toggleSave}
      />
      <OnboardingOverlay visible={showOnboarding} onDone={dismissOnboarding} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  wideRow: { flex: 1, flexDirection: "row" },
  mapPane: { flex: 1.4, backgroundColor: mapColors.water },
  listPane: {
    flex: 1,
    maxWidth: 460,
    // Trennlinie rechts — die Liste steht links, die Karte daneben.
    borderRightWidth: 1,
    borderRightColor: colors.border,
    backgroundColor: colors.background,
  },
  mapArea: { flex: 1, backgroundColor: mapColors.water },
  floatingBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerText: { flex: 1 },
  profileBtn: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.xxs,
  },
  profileIcon: { ...glyph.md, color: colors.accent },
  profileBadge: {
    position: "absolute",
    top: -spacing.xs,
    right: -spacing.xs,
    minWidth: sizes.badge,
    height: sizes.badge,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xs,
    borderWidth: 2,
    borderColor: colors.background,
  },
  profileBadgeText: { ...text.captionStrong, color: colors.onColor },
  kicker: { ...text.eyebrow, color: colors.primary },
  h1: { ...text.display, color: colors.ink, marginTop: spacing.xxs },
  sub: { ...text.label, color: colors.muted, marginTop: spacing.xxs },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    backgroundColor: colors.background,
    padding: spacing.xl,
  },
  loadingText: { ...text.body, color: colors.muted },
  errorText: {
    ...text.body,
    color: colors.muted,
    textAlign: "center",
    maxWidth: 300,
  },
  retry: {
    marginTop: spacing.sm,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  retryText: { ...text.bodyStrong, color: colors.onColor },
});
