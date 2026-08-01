import { useEffect, useMemo, useRef, useState } from "react";
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KIRCHSPIELE } from "@moinkark/shared";
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
import { useMapsApp, useReminderPref, useSavedEvents } from "../lib/store";
import {
  cancelForEvent,
  ensurePermission,
  rescheduleAll,
  scheduleForEvent,
  type ReminderPref,
} from "../lib/reminders";
import { syncSavedEvents, loadSnapshotStartTimes } from "../lib/savedSync";
import {
  DEFAULT_FILTERS,
  applyFilters,
  distanceKm,
  isInDithmarschen,
  isPast,
  sortByStart,
  type Bounds,
  type Filters,
} from "../lib/filters";
import { colors, fonts, spacing } from "../lib/theme";

const WIDE_BREAKPOINT = 900;

export default function Home() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isWide = width >= WIDE_BREAKPOINT;

  const { data, isLoading, isError, refetch } = useEvents();
  const { data: categories } = useCategories();
  const { location, status: locStatus, request: requestLocation } = useLocation();
  const { mapsApp, setMapsApp } = useMapsApp();
  const { isSaved, toggle: rawToggleSave, saved, removeMany, loaded: savedLoaded } = useSavedEvents();
  const { pref: reminderPref, setPref: setReminderPref } = useReminderPref();

  // Standort beim Start einmalig anfragen (opt-in System-Dialog) → Marker direkt sichtbar.
  useEffect(() => {
    requestLocation();
  }, [requestLocation]);

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [flyToken, setFlyToken] = useState(0);
  const [overviewToken, setOverviewToken] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [mapAreaHeight, setMapAreaHeight] = useState(0);
  const [didInitialZoom, setDidInitialZoom] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Onboarding nur beim allerersten Start zeigen.
  const ONBOARDING_KEY = "kkd:onboardingSeen";
  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_KEY).then((v) => {
      if (!v) setShowOnboarding(true);
    });
  }, []);
  const dismissOnboarding = () => {
    setShowOnboarding(false);
    AsyncStorage.setItem(ONBOARDING_KEY, "1").catch(() => {});
  };

  const allFeatures = data?.features ?? [];

  // Merken + lokale Erinnerung planen/abbrechen.
  const toggleSave = async (id: number) => {
    const wasSaved = isSaved(id);
    rawToggleSave(id);
    if (wasSaved) {
      cancelForEvent(id);
    } else if (reminderPref !== "off") {
      const f = allFeatures.find((x) => x.properties.id === id);
      if (f && (await ensurePermission())) scheduleForEvent(f, reminderPref);
    }
  };

  // Erinnerungs-Präferenz ändern → alle gemerkten Events neu planen.
  const onReminderPref = async (p: ReminderPref) => {
    setReminderPref(p);
    if (p !== "off") await ensurePermission();
    rescheduleAll(savedFeatures, p);
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

  // Dynamischer Start-Zoom: ist der User nah an Events (≤8 km) → reinzoomen, sonst Übersicht.
  useEffect(() => {
    if (didInitialZoom || !location || allFeatures.length === 0) return;
    const near = allFeatures.some((f) => {
      const [lng, lat] = f.geometry.coordinates;
      return distanceKm(location, { lat, lng }) <= 8;
    });
    if (near) {
      setFlyToken((t) => t + 1); // EventMap fliegt zur Position (Zoom 11.5)
    }
    setDidInitialZoom(true);
  }, [location, allFeatures, didInitialZoom]);

  // Einmaliger Abgleich gemerkter Events gegen frische Daten (entfällt / verschoben → lokale Mitteilung).
  const didSync = useRef(false);
  useEffect(() => {
    if (didSync.current || !savedLoaded || allFeatures.length === 0) return;
    didSync.current = true;
    (async () => {
      const ids = [...saved];

      // Vergangene Likes dauerhaft aufräumen — sowohl Events, die noch im Feed
      // stehen (über isPast) als auch verwaiste (nicht mehr im Feed), deren
      // Startzeit aus dem Snapshot in der Vergangenheit liegt.
      const byId = new Map(allFeatures.map((f) => [f.properties.id, f]));
      const snapTimes = await loadSnapshotStartTimes();
      const nowMs = Date.now();
      const pastIds = ids.filter((id) => {
        const f = byId.get(id);
        if (f) return isPast(f);
        const startUtc = snapTimes[id];
        // Verwaist + Startzeit vorbei → war ein vergangenes Event → entfernen.
        // Verwaist ohne bekannte Startzeit → in Ruhe lassen (kein Snapshot).
        return startUtc ? new Date(startUtc).getTime() < nowMs : false;
      });
      if (pastIds.length) {
        removeMany(pastIds);
        for (const id of pastIds) cancelForEvent(id);
      }

      const res = await syncSavedEvents(ids, allFeatures);
      // Reminder für entfallene/verschobene Events neu planen.
      if ((res.removed.length || res.changed.length) && reminderPref !== "off") {
        for (const id of res.removed) cancelForEvent(id);
        for (const id of res.changed) {
          cancelForEvent(id);
          const f = allFeatures.find((x) => x.properties.id === id);
          if (f) scheduleForEvent(f, reminderPref);
        }
      }
      // Einmalig nach dem Update: ALLE Reminder neu planen, damit alte (falsch
      // formatierte „Morgen"-) Benachrichtigungen durch die korrekte Variante ersetzt werden.
      if (reminderPref !== "off") {
        const KEY = "kkd:reminderFormatV2";
        if (!(await AsyncStorage.getItem(KEY))) {
          const savedNow = allFeatures.filter((f) => saved.has(f.properties.id));
          await rescheduleAll(savedNow, reminderPref);
          await AsyncStorage.setItem(KEY, "1");
        }
      }
    })();
  }, [savedLoaded, allFeatures, saved, reminderPref]);

  // Tap auf eine Mitteilung → zugehöriges Event öffnen (falls es noch existiert).
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
      const id = resp.notification.request.content.data?.eventId;
      if (typeof id === "number") setSelectedId(id);
    });
    return () => sub.remove();
  }, []);

  // Das Listen-Sheet verdeckt den unteren Teil der Karte. Die Liste soll sich aber NUR auf den
  // SICHTBAREN Ausschnitt (über dem Sheet) beziehen → unteren Bounds-Anteil abschneiden.
  // 0.28 ≈ Sheet im Standard-Snap (MID, ~184px bei ~660px Kartenhöhe). Web hat kein Sheet → volle Bounds.
  const visibleBounds = useMemo<Bounds | null>(() => {
    if (!bounds || isWide) return bounds;
    const span = bounds.north - bounds.south;
    const frac = mapAreaHeight > 0 ? Math.min(0.5, 184 / mapAreaHeight) : 0.28;
    return { ...bounds, south: bounds.south + span * frac };
  }, [bounds, isWide, mapAreaHeight]);

  const filtered = useMemo(
    () => sortByStart(applyFilters(allFeatures, filters, { location, bounds: visibleBounds })),
    [allFeatures, filters, location, visibleBounds]
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
    () => applyFilters(allFeatures, filters, { location }),
    [allFeatures, filters, location]
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
  const gemeindeOptions = useMemo(() => {
    if (!filters.kirchspiel) return [];
    const set = new Set<string>();
    for (const f of allFeatures) {
      if (f.properties.kirchspiel === filters.kirchspiel && f.properties.parish) {
        set.add(f.properties.parish);
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
      kirchspiele={kirchspielOptions as unknown as string[]}
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
      selectedId={selectedId}
      onSelect={setSelectedId}
      userLocation={location}
      onBoundsChange={setBounds}
      flyToUserToken={flyToken}
      flyToOverviewToken={overviewToken}
      dimmed={filtersOpen || profileOpen || selectedFeature !== null}
    />
  );

  if (isWide) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        {header}
        <View style={styles.wideRow}>
          <View style={styles.mapPane}>{map}</View>
          <View style={styles.listPane}>
            {filterBar}
            <EventList features={filtered} selectedId={selectedId} onSelect={setSelectedId} isSaved={isSaved} onToggleSave={toggleSave} />
          </View>
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
          <DraggableListSheet availableHeight={mapAreaHeight} topInset={0} bottomInset={insets.bottom}>
            <EventList features={filtered} selectedId={selectedId} onSelect={setSelectedId} isSaved={isSaved} onToggleSave={toggleSave} />
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
  mapPane: { flex: 1.4, backgroundColor: colors.mapWater },
  listPane: {
    flex: 1,
    maxWidth: 460,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
    backgroundColor: colors.background,
  },
  mapArea: { flex: 1, backgroundColor: colors.mapWater },
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
    borderRadius: 21,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  profileIcon: { fontSize: 19, color: colors.accent },
  profileBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: colors.background,
  },
  profileBadgeText: { fontFamily: fonts.bodySemibold, fontSize: 10, color: colors.onAccent },
  kicker: {
    fontFamily: fonts.bodySemibold,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.primary,
  },
  h1: {
    fontFamily: fonts.displayBold,
    fontSize: 28,
    color: colors.foreground,
    lineHeight: 32,
    marginTop: 2,
  },
  sub: { fontFamily: fonts.body, fontSize: 14, color: colors.muted, marginTop: 2 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    backgroundColor: colors.background,
    padding: spacing.xl,
  },
  loadingText: { fontFamily: fonts.body, fontSize: 15, color: colors.muted },
  errorText: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.muted,
    textAlign: "center",
    maxWidth: 300,
  },
  retry: {
    marginTop: spacing.sm,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: 12,
  },
  retryText: { fontFamily: fonts.bodySemibold, fontSize: 15, color: colors.onPrimary },
});
