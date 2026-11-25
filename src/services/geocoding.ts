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

interface NominatimItem {
  display_name: string;
  lat: string;
  lon: string;
  name?: string;
}

export async function searchPlaces(queryText: string): Promise<GeoPlace[]> {
  const trimmed = queryText.trim();
  if (trimmed.length < 2) return [];

  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&addressdetails=1&q=${encodeURIComponent(
    trimmed
  )}`;

  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`Location lookup returned status ${res.status}`);
  }

  const data = (await res.json()) as NominatimItem[];
  return data.map((item) => {
    const parts = item.display_name.split(',').map((s) => s.trim());
    const shortName = item.name || parts.slice(0, 2).join(', ');
    return {
      label: item.display_name,
      shortName,
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
    };
  });
}

export async function reverseGeocode(lat: number, lng: number): Promise<GeoPlace> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error('Reverse geocode error');
    const data = (await res.json()) as { display_name?: string; name?: string };
    const full = data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    const shortName = data.name || full.split(',').slice(0, 2).join(', ');
    return { label: full, shortName, lat, lng };
  } catch {
    const fallback = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    return { label: fallback, shortName: fallback, lat, lng };
  }
}
