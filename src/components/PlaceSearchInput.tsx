
import { Crosshair, Loader2, Search, MapPin } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { reverseGeocode, searchPlaces } from '../services/geocoding';
import { GeoPlace } from '../types/safeher';

interface PlaceSearchInputProps {
  id: string;
  label: string;
  placeholder: string;
  value: GeoPlace | null;
  onChange: (place: GeoPlace) => void;
  allowGps?: boolean;
}

export function PlaceSearchInput({
  id,
  label,
  placeholder,
  value,
  onChange,
  allowGps = false,
}: PlaceSearchInputProps) {
  const [queryText, setQueryText] = useState(value?.shortName || '');
  const [results, setResults] = useState<GeoPlace[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (value) {
      setQueryText(value.shortName);
    }
  }, [value?.lat, value?.lng, value?.shortName]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Automatically search while the user types.
  useEffect(() => {
    const text = queryText.trim();

    if (text.length < 3) {
      setResults([]);
      setIsOpen(false);
      setIsSearching(false);
      return;
    }

    const currentRequest = ++requestId.current;

    const timer = window.setTimeout(async () => {
      setIsSearching(true);
      setGeoError(null);

      try {
        const items = await searchPlaces(text);

        if (currentRequest === requestId.current) {
          setResults(items);
          setIsOpen(true);
        }
      } catch {
        if (currentRequest === requestId.current) {
          setResults([]);
          setGeoError('Unable to search locations. Please try again.');
          setIsOpen(true);
        }
      } finally {
        if (currentRequest === requestId.current) {
          setIsSearching(false);
        }
      }
    }, 400);

    return () => window.clearTimeout(timer);
  }, [queryText]);

  const runSearch = async () => {
    const text = queryText.trim();

    if (text.length < 3) {
      setGeoError('Please enter at least 3 characters.');
      return;
    }

    const currentRequest = ++requestId.current;
    setIsSearching(true);
    setGeoError(null);

    try {
      const items = await searchPlaces(text);

      if (currentRequest === requestId.current) {
        setResults(items);
        setIsOpen(true);

        if (items.length === 0) {
          setGeoError('No locations found. Try another search.');
        }
      }
    } catch {
      if (currentRequest === requestId.current) {
        setGeoError('Unable to search locations. Please try again.');
      }
    } finally {
      if (currentRequest === requestId.current) {
        setIsSearching(false);
      }
    }
  };

  const handleUseGps = () => {
    if (!navigator.geolocation) {
      setGeoError('Browser geolocation is unavailable.');
      return;
    }

    setLocating(true);
    setGeoError(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const place = await reverseGeocode(
            position.coords.latitude,
            position.coords.longitude
          );

          onChange(place);
          setQueryText(place.shortName);
          setResults([]);
          setIsOpen(false);
        } catch {
          setGeoError('Unable to identify your current location.');
        } finally {
          setLocating(false);
        }
      },
      () => {
        setGeoError('Location permission denied. Please search manually.');
        setLocating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
      }
    );
  };

  const selectPlace = (place: GeoPlace) => {
    onChange(place);
    setQueryText(place.shortName);
    setResults([]);
    setIsOpen(false);
    setGeoError(null);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <label
        htmlFor={id}
        className="block text-xs font-semibold text-slate-700 mb-1.5"
      >
        {label}
      </label>

      <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
          <input
            id={id}
            type="text"
            autoComplete="off"
            value={queryText}
            onFocus={() => {
              if (queryText.trim().length >= 3) {
                setIsOpen(true);
              }
            }}
            onChange={(event) => {
              setQueryText(event.target.value);
              setGeoError(null);
              setIsOpen(event.target.value.trim().length >= 3);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void runSearch();
              }

              if (event.key === 'Escape') {
                setIsOpen(false);
              }
            }}
            placeholder={placeholder}
            className="w-full h-10 pl-3 pr-9 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-teal-600"
          />

          <button
            type="button"
            onClick={() => void runSearch()}
            aria-label={`Search ${label}`}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-500 hover:text-teal-700 rounded cursor-pointer"
          >
            {isSearching ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
          </button>
        </div>

        {allowGps && (
          <button
            type="button"
            onClick={handleUseGps}
            disabled={locating}
            title="Use current GPS location"
            aria-label="Use current GPS location"
            className="h-10 px-3 inline-flex items-center justify-center bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg text-slate-700 transition-colors shrink-0 cursor-pointer"
          >
            {locating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Crosshair className="w-4 h-4" />
            )}
          </button>
        )}
      </div>

      {geoError && (
        <p className="text-xs text-red-600 mt-1">{geoError}</p>
      )}

      {isOpen && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
          {isSearching && results.length === 0 && (
            <div className="px-3 py-3 text-xs text-slate-500 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Searching locations...
            </div>
          )}

          {!isSearching && results.length === 0 && !geoError && (
            <div className="px-3 py-3 text-xs text-slate-500">
              No locations found.
            </div>
          )}

          {results.length > 0 && (
            <ul
              role="listbox"
              className="max-h-64 overflow-y-auto divide-y divide-slate-100"
            >
              {results.map((item, index) => (
                <li key={`${item.lat}-${item.lng}-${index}`}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => selectPlace(item)}
                    className="w-full text-left px-3 py-3 hover:bg-teal-50 transition-colors cursor-pointer flex items-start gap-2.5"
                  >
                    <MapPin className="w-4 h-4 mt-0.5 text-teal-600 shrink-0" />

                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-900">
                        {item.shortName}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {item.label}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
