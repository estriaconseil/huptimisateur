type LegacyAddressComponent = {
  long_name: string;
  short_name: string;
  types: string[];
};

/** Ancienne API `PlaceResult` (Autocomplete legacy). */
export function extractCityPostal(place: {
  address_components?: LegacyAddressComponent[];
}): { city: string; postal_code: string } {
  let city = "";
  let postal_code = "";

  for (const c of place.address_components ?? []) {
    const types = c.types;
    if (types.includes("locality")) {
      city = c.long_name;
    }
    if (types.includes("postal_code")) {
      postal_code = c.long_name;
    }
  }

  if (!city) {
    for (const c of place.address_components ?? []) {
      if (c.types.includes("sublocality") || c.types.includes("neighborhood")) {
        city = c.long_name;
        break;
      }
    }
  }

  return { city, postal_code };
}

/** Nouvelle classe `Place` (PlaceAutocompleteElement + fetchFields). */
export function extractCityPostalFromNewPlace(place: {
  addressComponents?: Array<{
    longText?: string | null;
    types: readonly string[];
  }>;
}): { city: string; postal_code: string } {
  let city = "";
  let postal_code = "";

  for (const c of place.addressComponents ?? []) {
    const types = c.types;
    const label = c.longText ?? "";
    if (types.includes("locality")) {
      city = label;
    }
    if (types.includes("postal_code")) {
      postal_code = label;
    }
  }

  if (!city) {
    for (const c of place.addressComponents ?? []) {
      if (
        c.types.includes("sublocality") ||
        c.types.includes("neighborhood") ||
        c.types.includes("administrative_area_level_2")
      ) {
        city = c.longText ?? "";
        break;
      }
    }
  }

  return { city, postal_code };
}
