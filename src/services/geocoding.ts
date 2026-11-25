
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
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
  properties: {
    name?: string;
    street?: string;
    housenumber?: string;
    district?: string;
    locality?: string;
    city?: string;
    county?: string;
    state?: string;
    country?: string;
    postcode?: string;
  };
}

interface PhotonResponse {
  features: PhotonFeature[];
}

function createPlace(feature: PhotonFeature): GeoPlace {
  const properties = feature.properties;
  const [lng, lat] = feature.geometry.coordinates;

  const streetAddress = [
    properties.housenumber,
    properties.street,
  ]
    .filter(Boolean)
    .join(' ');

  const locationParts = [
    properties.name,
    streetAddress,
    properties.locality,
    properties.district,
    properties.city,
    properties.county,
    properties.state,
    properties.country,
    properties.postcode,
  ].filter(Boolean);

  const uniqueParts = [...new Set(locationParts)];

  const label = uniqueParts.join(', ');

  const shortName =
    properties.name ||
    streetAddress ||
    properties.locality ||
    properties.district ||
    properties.city ||
    label;

  return {
    label: label || 'Unknown location',
    shortName: shortName || 'Unknown location',
    lat,
    lng,
  };
}

export async function searchPlaces(
  queryText: string
): Promise<GeoPlace[]> {
  const trimmed = queryText.trim();

  if (trimmed.length < 2) {
    return [];
  }

  const params = new URLSearchParams({
    q: trimmed,
    limit: '10',
    lang: 'en',
  });

  const url = `https://photon.komoot.io/api/?${params.toString()}`;

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(
      `Location search failed with status ${response.status}`
    );
  }

  const data = (await response.json()) as PhotonResponse;

  if (!data.features || !Array.isArray(data.features)) {
    return [];
  }

  const places = data.features
    .filter((feature) => {
      const coordinates = feature.geometry?.coordinates;

      return (
        Array.isArray(coordinates) &&
        coordinates.length >= 2 &&
        Number.isFinite(coordinates[0]) &&
        Number.isFinite(coordinates[1])
      );
    })
    .map(createPlace);

  // Remove duplicate coordinates.
  const uniquePlaces = new Map<string, GeoPlace>();

  for (const place of places) {
    const key = `${place.lat.toFixed(5)}-${place.lng.toFixed(5)}`;

    if (!uniquePlaces.has(key)) {
      uniquePlaces.set(key, place);
    }
  }

  return Array.from(uniquePlaces.values());
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

    const url = `https://photon.komoot.io/reverse?${params.toString()}`;

    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Reverse geocoding failed');
    }

    const data = (await response.json()) as PhotonResponse;

    if (data.features && data.features.length > 0) {
      const place = createPlace(data.features[0]);

      return {
        ...place,
        lat,
        lng,
      };
    }

    throw new Error('No address found');
  } catch {
    const fallback = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

    return {
      label: fallback,
      shortName: fallback,
      lat,
      lng,
    };
  }
}
