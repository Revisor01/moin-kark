import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KIRCHSPIELE } from "@kkd/shared";
import EventMap from "../components/EventMap";
import EventList from "../components/EventList";
import EventSheet from "../components/EventSheet";
import FilterBar from "../components/FilterBar";
import FilterSheet from "../components/FilterSheet";
import DraggableListSheet from "../components/DraggableListSheet";
import { useCategories, useEvents } from "../lib/hooks/useEvents";
import { useLocation } from "../lib/hooks/useLocation";
import {
  DEFAULT_FILTERS,
  applyFilters,
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

  // Standort beim Start einmalig anfragen (opt-in System-Dialog) → Marker direkt sichtbar.
  useEffect(() => {
    requestLocation();
  }, [requestLocation]);

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [flyToken, setFlyToken] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [mapAreaHeight, setMapAreaHeight] = useState(0);

  // Anzahl aktiver Filter (für Badge am Button). „Nähe" zählt separat im FilterBar.
  const activeFilterCount =
    (filters.date !== "all" ? 1 : 0) +
    (filters.kirchspiel ? 1 : 0) +
    (filters.parish ? 1 : 0) +
    (filters.category ? 1 : 0);

  const allFeatures = data?.features ?? [];

  // „In meiner Nähe": Standort anfordern, Filter togglen, zur Position fliegen.
  const onToggleNearby = async () => {
    if (filters.nearby) {
      setFilters((f) => ({ ...f, nearby: false }));
      return;
    }
    const loc = location ?? (await requestLocation());
    if (loc) {
      setFilters((f) => ({ ...f, nearby: true }));
      setFlyToken((t) => t + 1);
    }
  };

  const filtered = useMemo(
    () => sortByStart(applyFilters(allFeatures, filters, { location, bounds })),
    [allFeatures, filters, location, bounds]
  );

  const listSubtitle = `${filtered.length} ${
    filtered.length === 1 ? "Veranstaltung" : "Veranstaltungen"
  }${bounds && !filters.nearby ? " im Ausschnitt" : ""}`;

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

  // Beim ersten Laden Bounds noch nicht gesetzt → Liste zeigt alles.
  useEffect(() => {
    if (filters.nearby) setBounds(null); // Umkreis schlägt Viewport
  }, [filters.nearby]);

  const header = (
    <View style={styles.header}>
      <Text style={styles.kicker}>Evangelische Kirche Dithmarschen</Text>
      <Text style={styles.h1}>Kirche. In deiner Nähe.</Text>
      <Text style={styles.sub}>
        {filtered.length} {filtered.length === 1 ? "Veranstaltung" : "Veranstaltungen"}
        {/* "im Ausschnitt" nur im breiten Layout; mobil steht es im Listen-Sheet */}
        {isWide && bounds && !filters.nearby ? " im Kartenausschnitt" : ""}
      </Text>
    </View>
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

  const filterBar = (
    <FilterBar
      activeCount={activeFilterCount}
      onOpenFilters={() => setFiltersOpen(true)}
      nearby={filters.nearby}
      onToggleNearby={onToggleNearby}
      nearbyAvailable={locStatus !== "denied"}
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
            <EventList features={filtered} selectedId={selectedId} onSelect={setSelectedId} />
          </View>
        </View>
        {filterSheet}
        <EventSheet feature={selectedFeature} onClose={() => setSelectedId(null)} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {header}
      {filterBar}
      <View
        style={styles.mapArea}
        onLayout={(e) => setMapAreaHeight(e.nativeEvent.layout.height)}
      >
        {map}
        {mapAreaHeight > 0 ? (
          <DraggableListSheet availableHeight={mapAreaHeight} topInset={0} subtitle={listSubtitle}>
            <EventList features={filtered} selectedId={selectedId} onSelect={setSelectedId} />
          </DraggableListSheet>
        ) : null}
      </View>
      {filterSheet}
      <EventSheet feature={selectedFeature} onClose={() => setSelectedId(null)} />
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
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
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
