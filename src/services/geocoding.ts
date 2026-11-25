
import { GeoPlace } from '../types/safeher';

export interface CuratedCorridor {
  id: string;
  city: string;
  title: string;
  origin: GeoPlace;
  destination: GeoPlace;
}

export const CURATED_CORRIDORS: CuratedCorridor[] = [
  {
    id: 'blr-indiranagar-koramangala',
    city: 'Bengaluru',
    title: 'Indiranagar Metro to Koramangala 4th Block',
    origin: {
      label: 'Indiranagar Metro Station, CMH Road, Bengaluru',
      shortName: 'Indiranagar Metro',
      lat: 12.9784,
      lng: 77.6387,
    },
    destination: {
      label: 'Koramangala 4th Block, 80 Feet Road, Bengaluru',
      shortName: 'Koramangala 4th Block',
      lat: 12.9352,
      lng: 77.6245,
    },
  },
  {
    id: 'mum-bandra-dadar',
    city: 'Mumbai',
    title: 'Bandra Station West to Shivaji Park, Dadar',
    origin: {
      label: 'Bandra Railway Station West, Mumbai',
      shortName: 'Bandra Station West',
      lat: 19.0544,
      lng: 72.8402,
    },
    destination: {
      label: 'Shivaji Park, Dadar West, Mumbai',
      shortName: 'Shivaji Park, Dadar',
      lat: 19.0279,
      lng: 72.8384,
    },
  },
  {
    id: 'del-cp-hauzkhas',
    city: 'New Delhi',
    title: 'Connaught Place to AIIMS / Green Park',
    origin: {
      label: 'Rajiv Chowk Metro, Connaught Place, New Delhi',
      shortName: 'Connaught Place',
      lat: 28.6328,
      lng: 77.2197,
    },
    destination: {
      label: 'Green Park Metro Station, New Delhi',
      shortName: 'Green Park Metro',
      lat: 28.5597,
      lng: 77.2068,
    },
  },
  {
    id: 'hyd-madhapur-jubilee',
    city: 'Hyderabad',
    title: 'Hitech City Metro to Jubilee Hills Check Post',
    origin: {
      label: 'Hitech City Metro Station, Madhapur, Hyderabad',
      shortName: 'Hitech City Metro',
      lat: 17.4483,
      lng: 78.3806,
    },
    destination: {
      label: 'Jubilee Hills Check Post Metro, Hyderabad',
      shortName: 'Jubilee Hills Check Post',
      lat: 17.4287,
      lng: 78.4126,
    },
  },
];

interface PhotonFeature {
  geometry?: {
    coordinates?: [number, number];
  };
  properties?: {
    name?: string;
    street?: string;
    housenumber?: string;
    district?: string;
    locality?: string;
    suburb?: string;
    city?: string;
    county?: string;
    state?: string;
    country?: string;
    postcode?: string;
  };
}

interface PhotonResponse {
  features?: PhotonFeature[];
}

interface NominatimItem {
  display_name: string;
  lat: string;
  lon: string;
  name?: string;
}

const INDIA_COUNTRY_CODE = 'in';

const SEARCH_CITIES = [
  'Nellore',
  'Hyderabad',
  'Bengaluru',
  'Vijayawada',
  'Visakhapatnam',
  'Chennai',
  'Tirupati',
  'Bapatla',
  'Chirala',
  'Guntur',
  'Anantapur',
  'Eluru',
  'Kurnool',
];

function createPlace(
  label: string,
  lat: number,
  lng: number,
  name?: string
): GeoPlace {
  const parts = label
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  return {
    label,
    shortName: name || parts[0] || label,
    lat,
    lng,
  };
}

function convertPhotonFeature(
  feature: PhotonFeature
): GeoPlace | null {
  const coordinates = feature.geometry?.coordinates;
  const properties = feature.properties;

  if (!coordinates || !properties) return null;

  const lng = Number(coordinates[0]);
  const lat = Number(coordinates[1]);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  const street = [
    properties.housenumber,
    properties.street,
  ]
    .filter(Boolean)
    .join(' ');

  const parts = [
    properties.name,
    street,
    properties.suburb,
    properties.locality,
    properties.district,
    properties.city,
    properties.county,
    properties.state,
    properties.country,
    properties.postcode,
  ].filter(Boolean) as string[];

  const label = [...new Set(parts)].join(', ');

  if (!label) return null;

  return createPlace(
    label,
    lat,
    lng,
    properties.name || street || properties.suburb
  );
}

async function searchPhoton(
  query: string
): Promise<GeoPlace[]> {
  const params = new URLSearchParams({
    q: query,
    limit: '20',
    lang: 'en',
    countrycode: INDIA_COUNTRY_CODE,
    dedupe: '1',
  });

  const response = await fetch(
    `https://photon.komoot.io/api/?${params.toString()}`
  );

  if (!response.ok) {
    throw new Error(`Photon error: ${response.status}`);
  }

  const data = (await response.json()) as PhotonResponse;

  return (data.features || [])
    .map(convertPhotonFeature)
    .filter((place): place is GeoPlace => place !== null);
}

async function searchNominatim(
  query: string
): Promise<GeoPlace[]> {
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    addressdetails: '1',
    limit: '10',
    countrycodes: INDIA_COUNTRY_CODE,
  });

  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?${params.toString()}`,
    {
      headers: {
        Accept: 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Nominatim error: ${response.status}`);
  }

  const data = (await response.json()) as NominatimItem[];

  return data
    .map((item) => {
      const lat = Number(item.lat);
      const lng = Number(item.lon);

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return null;
      }

      return createPlace(
        item.display_name,
        lat,
        lng,
        item.name
      );
    })
    .filter((place): place is GeoPlace => place !== null);
}

function removeDuplicates(places: GeoPlace[]): GeoPlace[] {
  const unique = new Map<string, GeoPlace>();

  for (const place of places) {
    const key = `${place.lat.toFixed(5)}-${place.lng.toFixed(5)}`;

    if (!unique.has(key)) {
      unique.set(key, place);
    }
  }

  return Array.from(unique.values());
}

export async function searchPlaces(
  queryText: string
): Promise<GeoPlace[]> {
  const query = queryText.trim();

  if (query.length < 2) return [];

  let photonResults: GeoPlace[] = [];

  try {
    photonResults = await searchPhoton(query);
  } catch {
    // Continue with the fallback search.
  }

  // If Photon returns few results, try the second search provider.
  if (photonResults.length < 5) {
    try {
      const fallbackResults = await searchNominatim(query);

      return removeDuplicates([
        ...photonResults,
        ...fallbackResults,
      ]).slice(0, 20);
    } catch {
      // Keep available Photon results.
    }
  }

  return removeDuplicates(photonResults).slice(0, 20);
}

export async function reverseGeocode(
  lat: number,
  lng: number
): Promise<GeoPlace> {
  try {
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lng),
      lang: 'en',
    });

    const response = await fetch(
      `https://photon.komoot.io/reverse?${params.toString()}`
    );

    if (!response.ok) {
      throw new Error('Photon reverse search failed');
    }

    const data = (await response.json()) as PhotonResponse;

    if (data.features?.length) {
      const place = convertPhotonFeature(data.features[0]);

      if (place) {
        return {
          ...place,
          lat,
          lng,
        };
      }
    }
  } catch {
    // Try Nominatim fallback.
  }

  try {
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lng),
      format: 'jsonv2',
    });

    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?${params.toString()}`,
      {
        headers: {
          Accept: 'application/json',
        },
      }
    );

    if (response.ok) {
      const data = (await response.json()) as {
        display_name?: string;
        name?: string;
      };

      if (data.display_name) {
        return createPlace(
          data.display_name,
          lat,
          lng,
          data.name
        );
      }
    }
  } catch {
    // Use coordinate fallback.
  }

  const fallback = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

  return {
    label: fallback,
    shortName: fallback,
    lat,
    lng,
  };
}
