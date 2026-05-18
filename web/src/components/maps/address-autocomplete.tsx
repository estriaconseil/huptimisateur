"use client";

import { useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { loadPlacesLibrary } from "@/lib/maps/load-google-maps";
import { extractCityPostalFromNewPlace } from "@/lib/maps/parse-google-place";
import { cn } from "@/lib/utils";

export type ResolvedPlace = {
  address_raw: string;
  address_formatted: string;
  city: string;
  postal_code: string;
  lat: number | null;
  lng: number | null;
};

type Props = {
  id?: string;
  disabled?: boolean;
  value: string;
  onChange: (value: string) => void;
  onResolved: (place: ResolvedPlace) => void;
};

/** Sans clé Google : champ texte simple. */
export function AddressAutocomplete(props: Props) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return (
      <PlainAddressInput
        id={props.id}
        disabled={props.disabled}
        value={props.value}
        onChange={props.onChange}
        hint="Ajoutez NEXT_PUBLIC_GOOGLE_MAPS_API_KEY pour l’autocomplete."
      />
    );
  }
  return <AddressAutocompleteLoaded {...props} apiKey={apiKey} />;
}

function PlainAddressInput({
  id,
  disabled,
  value,
  onChange,
  hint,
}: Pick<Props, "id" | "disabled" | "value" | "onChange"> & { hint?: string }) {
  return (
    <div className="space-y-1">
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder="Adresse complète"
        autoComplete="street-address"
      />
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
    </div>
  );
}

function readLatLng(loc: google.maps.LatLng | google.maps.LatLngLiteral | null | undefined): {
  lat: number | null;
  lng: number | null;
} {
  if (!loc) return { lat: null, lng: null };
  if (typeof (loc as google.maps.LatLng).lat === "function") {
    const ll = loc as google.maps.LatLng;
    return { lat: ll.lat(), lng: ll.lng() };
  }
  const lit = loc as google.maps.LatLngLiteral;
  return { lat: lit.lat ?? null, lng: lit.lng ?? null };
}

function AddressAutocompleteLoaded({
  id,
  disabled,
  value,
  onChange,
  onResolved,
  apiKey,
}: Props & { apiKey: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<google.maps.places.PlaceAutocompleteElement | null>(null);
  const onChangeRef = useRef(onChange);
  const onResolvedRef = useRef(onResolved);
  onChangeRef.current = onChange;
  onResolvedRef.current = onResolved;

  const [loadError, setLoadError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function onGmpSelect(event: Event) {
      const e = event as unknown as {
        placePrediction: google.maps.places.PlacePrediction;
      };
      const place = e.placePrediction.toPlace();
      await place.fetchFields({
        fields: ["displayName", "formattedAddress", "location", "addressComponents"],
      });

      const formatted = place.formattedAddress ?? "";
      const raw =
        (place.displayName && place.displayName.length > 0 ? place.displayName : formatted) ?? "";
      const { city, postal_code } = extractCityPostalFromNewPlace(place);
      const { lat, lng } = readLatLng(place.location ?? null);

      onChangeRef.current(formatted || raw);
      onResolvedRef.current({
        address_raw: raw,
        address_formatted: formatted,
        city,
        postal_code,
        lat,
        lng,
      });
    }

    (async () => {
      setLoadError(null);
      setReady(false);
      try {
        await loadPlacesLibrary(apiKey);
        if (cancelled || !containerRef.current) return;

        const PlaceAutocompleteElement = google.maps.places.PlaceAutocompleteElement;

        const el = new PlaceAutocompleteElement({
          includedRegionCodes: ["ca"],
          requestedLanguage: "fr-CA",
        });

        if (id) el.id = id;
        el.className = cn("w-full min-w-0");
        el.placeholder = "Tapez une adresse au Québec…";
        if ("disabled" in el && typeof (el as { disabled?: boolean }).disabled !== "undefined") {
          (el as { disabled: boolean }).disabled = Boolean(disabled);
        }

        el.addEventListener("gmp-select", onGmpSelect);

        containerRef.current.innerHTML = "";
        containerRef.current.appendChild(el);
        widgetRef.current = el;

        if (value) {
          el.value = value;
        }

        setReady(true);
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : "Impossible de charger Google Places."
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      const w = widgetRef.current;
      if (w) {
        w.removeEventListener("gmp-select", onGmpSelect);
      }
      widgetRef.current = null;
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
    };
  }, [apiKey, id]);

  useEffect(() => {
    const w = widgetRef.current;
    if (!w || value === undefined) return;
    if (w.value !== value) {
      w.value = value;
    }
  }, [value]);

  useEffect(() => {
    const w = widgetRef.current;
    if (w && "disabled" in w) {
      (w as { disabled: boolean }).disabled = Boolean(disabled);
    }
  }, [disabled]);

  if (loadError) {
    return (
      <p className="text-destructive text-sm" role="alert">
        {loadError} Vérifie la clé API, Places API (New), et les restrictions de referrer (localhost).
      </p>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn("w-full min-h-8", !ready && "opacity-70")}
      aria-busy={!ready}
    />
  );
}
