import { MapPin } from "lucide-react";

/** Shared shape for LINZ-enriched property cards (`application_properties` fields). */
export interface PropertyCardMinimalProperty {
  address_full?: string;
  address_normalized?: string;
  title_number?: string | null;
  legal_description?: string | null;
  estate_type?: string | null;
  land_area_m2?: number | null;
  linz_parcel_id?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  enriched_at?: string | null;
}

type Props = { property: PropertyCardMinimalProperty };

/** Light-theme LINZ-enriched property summary (white card) for panels on light backgrounds. */
export function PropertyCardLight({ property }: Props) {
  const address = property.address_normalized || property.address_full || "—";
  const isFreehold = property.estate_type?.toLowerCase().includes("fee simple");
  const enrichedTime = property.enriched_at
    ? new Date(property.enriched_at).toLocaleTimeString("en-NZ", { hour: "2-digit", minute: "2-digit" })
    : null;

  const hasCoords =
    property.latitude != null &&
    property.longitude != null &&
    Number.isFinite(property.latitude) &&
    Number.isFinite(property.longitude);

  const fields = [
    { label: "TITLE NUMBER", value: property.title_number || "—" },
    { label: "LEGAL DESCRIPTION", value: property.legal_description || "—" },
    { label: "ESTATE TYPE", value: property.estate_type || "—" },
    {
      label: "LAND AREA",
      value:
        property.land_area_m2 != null && Number.isFinite(property.land_area_m2)
          ? `${property.land_area_m2.toLocaleString()} m²`
          : "—",
    },
    { label: "LINZ PARCEL ID", value: property.linz_parcel_id || "—" },
    {
      label: "COORDINATES",
      value: hasCoords ? `${property.latitude!.toFixed(4)}, ${property.longitude!.toFixed(4)}` : "—",
    },
  ];

  return (
    <div className="w-full rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-4">
        <div className="flex min-w-0 flex-1 gap-2.5">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" strokeWidth={1.5} />
          <h3 className="truncate text-base font-medium leading-snug text-slate-900">{address}</h3>
        </div>
        {enrichedTime ? (
          <span className="ml-3 shrink-0 text-xs text-slate-500">Enriched {enrichedTime}</span>
        ) : null}
      </div>

      <div className="flex gap-2 px-5 pb-3">
        <span
          className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-xs font-medium ${
            isFreehold
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-amber-200 bg-amber-50 text-amber-700"
          }`}
        >
          {isFreehold ? "Freehold" : property.estate_type || "Unknown"}
        </span>
        <span className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
          {isFreehold ? "Standard Title" : "Cross-lease"}
        </span>
        <span className="inline-flex items-center rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
          LVR {isFreehold ? "95%" : "80%"}
        </span>
      </div>

      <div className="px-5 pb-4">
        <div className="grid grid-cols-2 gap-x-6 gap-y-3.5">
          {fields.map((f) => (
            <div key={f.label} className="min-w-0">
              <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">{f.label}</div>
              <div className="truncate text-sm font-medium text-slate-900" title={f.value}>
                {f.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between rounded-b-xl border-t border-slate-100 bg-slate-50/50 px-5 py-3">
        <span className="text-xs text-slate-500">Source: LINZ + Google</span>
        {hasCoords ? (
          <a
            href={`https://www.google.com/maps?q=${property.latitude},${property.longitude}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            View on map →
          </a>
        ) : null}
      </div>
    </div>
  );
}
