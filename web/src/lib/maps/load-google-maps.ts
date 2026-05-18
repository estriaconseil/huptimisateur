import { importLibrary, setOptions } from "@googlemaps/js-api-loader";

let bootstrapped = false;

/**
 * Configure la clé puis charge la librairie `places` via le bootstrap officiel
 * (`importLibrary` — incompatible avec un simple &lt;script src="...maps/api/js"&gt; seul).
 */
export async function loadPlacesLibrary(apiKey: string): Promise<google.maps.PlacesLibrary> {
  if (typeof window === "undefined") {
    throw new Error("loadPlacesLibrary ne s’utilise que côté client.");
  }

  if (!bootstrapped) {
    setOptions({ key: apiKey, v: "weekly" });
    bootstrapped = true;
  }

  return importLibrary("places");
}
