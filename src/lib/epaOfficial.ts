/** Live EPA Envirofacts / SDWIS Lead & Copper Rule context (not sealed). */

const EPA_BASE = "https://data.epa.gov/efservice";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_PWSID = "MI0002310"; // City of Flint, MI

export type OfficialLeadSample = {
  sampleId: string;
  periodStart: string | null;
  periodEnd: string | null;
  leadPpb: number;
  contaminantCode: string;
  unitOriginal: string | null;
};

export type OfficialContext = {
  source: "EPA_SDWIS_ENVIROFACTS";
  disclaimer: string;
  fetchedAt: string;
  cached: boolean;
  system: {
    pwsid: string;
    name: string;
    city: string | null;
    state: string | null;
    populationServed: number | null;
    activityCode: string | null;
    epaRegion: string | null;
  };
  thresholds: {
    communityAlertPpb: number;
    legalLcriPpb: number;
    epaLcrActionLevelPpb: number;
  };
  latest: OfficialLeadSample | null;
  history: OfficialLeadSample[];
  violationCount: number;
  healthBasedViolationCount: number;
  links: {
    envirofactsApi: string;
    sdwisSearch: string;
  };
};

type CacheEntry = { expiresAt: number; data: OfficialContext };

const cache = new Map<string, CacheEntry>();

async function epaJson<T>(path: string): Promise<T> {
  const url = `${EPA_BASE}/${path}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) {
    throw new Error(`EPA Envirofacts request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

function toIsoDate(value: unknown): string | null {
  if (!value || typeof value !== "string") return null;
  const d = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

function toPpb(measure: number, unit: string | null | undefined): number {
  const u = (unit || "").toLowerCase();
  if (u === "mg/l" || u === "mg/L".toLowerCase()) return measure * 1000;
  return measure;
}

type WaterSystemRow = {
  pwsid: string;
  pws_name: string;
  city_name?: string | null;
  state_code?: string | null;
  population_served_count?: number | null;
  pws_activity_code?: string | null;
  epa_region?: string | null;
};

type LcrSampleRow = {
  pwsid: string;
  sample_id: string;
  sampling_start_date?: string | null;
  sampling_end_date?: string | null;
};

type LcrResultRow = {
  pwsid: string;
  sample_id: string;
  contaminant_code?: string | null;
  sample_measure?: number | null;
  unit_of_measure?: string | null;
};

type ViolationRow = {
  is_health_based_ind?: string | null;
};

export async function getOfficialContext(
  pwsid = DEFAULT_PWSID
): Promise<OfficialContext> {
  const id = (pwsid || DEFAULT_PWSID).trim().toUpperCase();
  const hit = cache.get(id);
  if (hit && hit.expiresAt > Date.now()) {
    return { ...hit.data, cached: true };
  }

  const [systems, samples, results, violations] = await Promise.all([
    epaJson<WaterSystemRow[]>(`water_system/pwsid/${id}/JSON`),
    epaJson<LcrSampleRow[]>(`lcr_sample/pwsid/${id}/JSON`),
    epaJson<LcrResultRow[]>(`lcr_sample_result/pwsid/${id}/JSON`),
    epaJson<ViolationRow[]>(`violation/pwsid/${id}/JSON`).catch(() => []),
  ]);

  const system = Array.isArray(systems) ? systems[0] : undefined;
  if (!system) throw new Error(`No EPA water system found for PWSID ${id}`);

  const pb90 = new Map<string, LcrResultRow>();
  for (const row of Array.isArray(results) ? results : []) {
    if (row.contaminant_code === "PB90" && row.sample_measure != null) {
      pb90.set(row.sample_id, row);
    }
  }

  const history: OfficialLeadSample[] = [];
  for (const sample of Array.isArray(samples) ? samples : []) {
    const result = pb90.get(sample.sample_id);
    if (!result || result.sample_measure == null) continue;
    history.push({
      sampleId: sample.sample_id,
      periodStart: toIsoDate(sample.sampling_start_date),
      periodEnd: toIsoDate(sample.sampling_end_date),
      leadPpb: Number(
        toPpb(result.sample_measure, result.unit_of_measure).toFixed(2)
      ),
      contaminantCode: "PB90",
      unitOriginal: result.unit_of_measure ?? null,
    });
  }

  history.sort((a, b) =>
    (a.periodEnd || a.periodStart || "").localeCompare(
      b.periodEnd || b.periodStart || ""
    )
  );

  const violList = Array.isArray(violations) ? violations : [];
  const data: OfficialContext = {
    source: "EPA_SDWIS_ENVIROFACTS",
    disclaimer:
      "Official utility-reported Lead & Copper Rule 90th-percentile summaries from EPA SDWIS. Not cryptographically sealed, not household kit evidence, and historically incomplete for crises like Flint.",
    fetchedAt: new Date().toISOString(),
    cached: false,
    system: {
      pwsid: system.pwsid,
      name: system.pws_name,
      city: system.city_name ?? null,
      state: system.state_code ?? null,
      populationServed: system.population_served_count ?? null,
      activityCode: system.pws_activity_code ?? null,
      epaRegion: system.epa_region ?? null,
    },
    thresholds: {
      communityAlertPpb: 5,
      legalLcriPpb: 10,
      epaLcrActionLevelPpb: 15,
    },
    latest: history.length ? history[history.length - 1] : null,
    history: history.slice(-12),
    violationCount: violList.length,
    healthBasedViolationCount: violList.filter(
      (v) => (v.is_health_based_ind || "").toUpperCase() === "Y"
    ).length,
    links: {
      envirofactsApi: `${EPA_BASE}/water_system/pwsid/${id}/JSON`,
      sdwisSearch: `https://enviro.epa.gov/enviro/sdw_query_form?p_city=&p_county=&p_sysname=&p_zip=&p_pwsid=${id}`,
    },
  };

  cache.set(id, { expiresAt: Date.now() + CACHE_TTL_MS, data });
  return data;
}

export { DEFAULT_PWSID };
