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
import { track, trackScreen } from "../lib/analytics";
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

/** Erinnerungs-Stufe → Messwert als Tabelle, damit der Typecheck neue Stufen meldet. */
const VORLAUF: Record<ReminderPref, string> = {
  off: "aus",
  evening: "vorabend",
  "2h": "zwei-stunden",
  both: "beides",
};

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

  // Erst nach dem Onboarding fragen, sonst schiebt sich der Systemdialog vor die Erklärung.

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [flyToken, setFlyToken] = useState(0);
  const [overviewToken, setOverviewToken] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [mapAreaHeight, setMapAreaHeight] = useState(0);
  // Unter der Kante geparkter Sheet-Anteil, die Liste braucht ihn als Endabstand.
  const [sheetHiddenPx, setSheetHiddenPx] = useState(0);
  const [didInitialZoom, setDidInitialZoom] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Vor dem Onboarding-Effekt, weil die Begrüßung auch über einem geöffneten Termin liegt.
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

  // Ohne Seitenaufruf zählt Umami keine Besucher.
  useEffect(() => {
    trackScreen("start");
  }, []);

  const dismissOnboarding = () => {
    setShowOnboarding(false);
    AsyncStorage.setItem(ONBOARDING_KEY, "1").catch(() => {});
    // Jetzt ist der Bildschirm frei und die Erklärung gelesen.
    requestLocation();
  };

  const allFeatures = data?.features ?? [];

  // useCallback, sonst rendern alle Karten bei jeder Positionsmeldung neu.
  const toggleSave = useCallback(
    async (id: number) => {
      const wasSaved = isSaved(id);
      rawToggleSave(id);
      track("termin-gemerkt", { aktion: wasSaved ? "entfernt" : "gemerkt" });
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
    track("erinnerung-gesetzt", { vorlauf: VORLAUF[p] });
    if (p !== "off") await ensurePermission();
    rescheduleAll(savedFeatures, p).catch(() => {});
  };

  // Außerhalb Dithmarschens auf die Übersicht, sonst filtert der Ausschnitt die Liste auf 0.
  const onJumpToLocation = async () => {
    const loc = location ?? (await requestLocation());
    if (!loc) return;
    if (isInDithmarschen(loc)) setFlyToken((t) => t + 1);
    else setOverviewToken((t) => t + 1);
  };

  // Einmal zum Standort zoomen, nur innerhalb Dithmarschens.
  useEffect(() => {
    if (didInitialZoom || !location) return;
    if (isInDithmarschen(location)) setFlyToken((t) => t + 1);
    setDidInitialZoom(true);
  }, [location, didInitialZoom]);

  // Gemerkte Events gegen frische Daten abgleichen und Erinnerungen nachziehen.
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

  // useLastNotificationResponse, weil ein Listener die Antwort beim Kaltstart verpasst.
  const lastNotificationResponse = useLastNotificationTap();
  useEffect(() => {
    if (!lastNotificationResponse) return;
    const id = lastNotificationResponse.notification.request.content.data?.eventId;
    if (typeof id === "number") {
      setSelectedId(id);
      track("termin-geoeffnet", { quelle: "mitteilung" });
    }
    // Verbraucht, sonst öffnet ein späterer Mount das Event erneut.
    clearLastNotificationTap();
  }, [lastNotificationResponse]);

  // ID erst setzen, wenn der Feed den Termin kennt.
  const [pendingEventId, setPendingEventId] = useState<number | null>(null);
  useEffect(() => {
    if (!incomingUrl) return;
    const id = eventIdFromUrl(incomingUrl);
    if (id !== null) setPendingEventId(id);
  }, [incomingUrl]);
  // Universal Links kommen als /event/<id>, da greift useURL nicht.
  useEffect(() => {
    if (typeof eventParam !== "string" || !/^\d+$/.test(eventParam)) return;
    setPendingEventId(Number(eventParam));
  }, [eventParam]);
  useEffect(() => {
    if (pendingEventId === null || allFeatures.length === 0) return;
    const known = allFeatures.some((f) => f.properties.id === pendingEventId);
    // Unbekannte ID still verwerfen.
    if (known) {
      setSelectedId(pendingEventId);
      track("termin-geoeffnet", { quelle: "link" });
    }
    setPendingEventId(null);
  }, [pendingEventId, allFeatures]);

  // Effekt auf allen Plattformen, damit die Hook-Reihenfolge gleich bleibt; nur Android hat die Taste.
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

  // Die Liste folgt nur dem sichtbaren Teil über dem Sheet (etwa 0.28 der Höhe).
  const visibleBounds = useMemo<Bounds | null>(() => {
    if (!bounds || isWide) return bounds;
    const span = bounds.north - bounds.south;
    const frac = mapAreaHeight > 0 ? Math.min(0.5, 184 / mapAreaHeight) : 0.28;
    return { ...bounds, south: bounds.south + span * frac };
  }, [bounds, isWide, mapAreaHeight]);

  // Minutentakt, sonst zeigte eine lange offene App abgelaufene Termine.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNowTick(Date.now()), 60_000);
    return () => clearInterval(iv);
  }, []);

  // Ohne `location`, sonst filterte jeder GPS-Schritt neu.
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

  // Bis die Daten da sind, die rohe Set-Größe.
  const savedCount = allFeatures.length > 0 ? savedFeatures.length : saved.size;


  // Pins folgen nicht dem Ausschnitt, sonst verschwinden sie beim Zoomen.
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

  // Mehrfach zugeordnete Events bringen alle ihre Gemeinden mit.
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
        onPress={() => { setProfileOpen(true); track("bereich-geoeffnet", { bereich: "profil" }); }}
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
      onSelectEvent={(id) => { setSelectedId(id); if (id !== null) track("termin-geoeffnet", { quelle: "karte" }); }}
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
      onOpenFilters={() => { setFiltersOpen(true); track("bereich-geoeffnet", { bereich: "filter" }); }}
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
      onDate={(d) => {
        setFilters((f) => ({ ...f, date: d }));
        track("filter-genutzt", { filter: "zeit" });
      }}
      rangeFrom={filters.rangeFrom}
      rangeTo={filters.rangeTo}
      onRange={(von, bis) => setFilters((f) => ({ ...f, rangeFrom: von, rangeTo: bis }))}
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
      onSelect={(id) => { setSelectedId(id); track("termin-geoeffnet", { quelle: "liste" }); }}
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
          {/* Eigene Ebene aus demselben Grund wie der Kartenbereich unten: Die
              Filterknöpfe tragen Schatten und fingen sonst Touches ab, die
              einem offenen Sheet gelten. */}
          <View style={styles.listPane} collapsable={false}>
            {filterBar}
            <EventList features={filtered} selectedId={selectedId} onSelect={(id) => { setSelectedId(id); track("termin-geoeffnet", { quelle: "liste" }); }} isSaved={isSaved} onToggleSave={toggleSave} bottomInset={insets.bottom} onRefresh={refetch} refreshing={isFetching} />
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
      {/* collapsable={false}: Der Kartenbereich bildet eine eigene Ebene. Ohne
          sie hängt React Native seine Kinder nativ an einen Vorfahren weiter
          oben, und das Listen-Sheet lag neben den Sheets für Profil, Filter
          und Termin. Android gibt Touches dort zuerst dem Element mit Schatten
          (elevation), egal was oben gezeichnet ist — wo das Listen-Sheet
          verdeckt darunter lag, ließen sich Profil und Filter nicht scrollen. */}
      <View
        style={styles.mapArea}
        collapsable={false}
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
