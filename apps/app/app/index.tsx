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
import FilterChips from "../components/FilterChips";
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

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [flyToken, setFlyToken] = useState(0);

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
      <Text style={styles.h1}>Kirche. Hier bei dir.</Text>
      <Text style={styles.sub}>
        {filtered.length} {filtered.length === 1 ? "Veranstaltung" : "Veranstaltungen"}
        {bounds && !filters.nearby ? " im Kartenausschnitt" : ""}
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
    <FilterChips
      date={filters.date}
      onDate={(d) => setFilters((f) => ({ ...f, date: d }))}
      nearby={filters.nearby}
      onToggleNearby={onToggleNearby}
      nearbyAvailable={locStatus !== "denied"}
      kirchspiele={kirchspielOptions as unknown as string[]}
      activeKirchspiel={filters.kirchspiel}
      onKirchspiel={(k) => setFilters((f) => ({ ...f, kirchspiel: k }))}
      categories={categoryTitles}
      activeCategory={filters.category}
      onCategory={(c) => setFilters((f) => ({ ...f, category: c }))}
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
        <EventSheet feature={selectedFeature} onClose={() => setSelectedId(null)} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {header}
      {filterBar}
      <View style={styles.mapNarrow}>{map}</View>
      <View style={styles.listNarrow}>
        <EventList features={filtered} selectedId={selectedId} onSelect={setSelectedId} />
      </View>
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
  mapNarrow: { height: 280, backgroundColor: colors.mapWater },
  listNarrow: { flex: 1 },
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
