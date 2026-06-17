import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import EventMap from "../components/EventMap";
import EventList from "../components/EventList";
import EventSheet from "../components/EventSheet";
import FilterChips from "../components/FilterChips";
import { useCategories, useEvents } from "../lib/hooks/useEvents";
import { DEFAULT_FILTERS, applyFilters, sortByStart, type Filters } from "../lib/filters";
import { colors, fonts, spacing } from "../lib/theme";

const WIDE_BREAKPOINT = 900;

export default function Home() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isWide = width >= WIDE_BREAKPOINT;

  const { data, isLoading, isError, refetch } = useEvents();
  const { data: categories } = useCategories();

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const allFeatures = data?.features ?? [];

  const filtered = useMemo(
    () => sortByStart(applyFilters(allFeatures, filters)),
    [allFeatures, filters]
  );

  const categoryTitles = useMemo(
    () => (categories ?? []).slice(0, 14).map((c) => c.title),
    [categories]
  );

  const selectedFeature = useMemo(
    () => allFeatures.find((f) => f.properties.id === selectedId) ?? null,
    [allFeatures, selectedId]
  );

  const header = (
    <View style={styles.header}>
      <Text style={styles.kicker}>Kirchenkreis Dithmarschen</Text>
      <Text style={styles.h1}>Was ist los in Dithmarschen</Text>
      <Text style={styles.sub}>
        {filtered.length} {filtered.length === 1 ? "Veranstaltung" : "Veranstaltungen"}
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
        <Text style={styles.errorText}>
          Die Veranstaltungen konnten nicht geladen werden.
        </Text>
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
      categories={categoryTitles}
      activeCategory={filters.category}
      onCategory={(c) => setFilters((f) => ({ ...f, category: c }))}
    />
  );

  // --- Breites Layout: Karte links, Liste rechts ---
  if (isWide) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.wideRow}>
          <View style={styles.mapPane}>
            <EventMap features={filtered} selectedId={selectedId} onSelect={setSelectedId} />
          </View>
          <View style={styles.listPane}>
            {filterBar}
            <EventList
              features={filtered}
              selectedId={selectedId}
              onSelect={setSelectedId}
              header={header}
            />
          </View>
        </View>
        <EventSheet feature={selectedFeature} onClose={() => setSelectedId(null)} />
      </View>
    );
  }

  // --- Schmales Layout: Karte oben, Liste unten (scrollbar) ---
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {header}
      {filterBar}
      <View style={styles.mapNarrow}>
        <EventMap features={filtered} selectedId={selectedId} onSelect={setSelectedId} />
      </View>
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
    paddingBottom: spacing.sm,
    backgroundColor: colors.background,
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
