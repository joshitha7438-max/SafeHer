import { Crosshair, Loader2, Search } from 'lucide-react';
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

  useEffect(() => {
    if (value) {
      setQueryText(value.shortName);
    }
  }, [value?.lat, value?.lng, value?.shortName]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const runSearch = async (text: string) => {
    if (text.trim().length < 3) {
      setResults([]);
      return;
    }
    setIsSearching(true);
    setGeoError(null);
    try {
      const items = await searchPlaces(text);
      setResults(items);
      setIsOpen(true);
    } catch {
      setGeoError('Unable to reach OpenStreetMap search right now.');
    } finally {
      setIsSearching(false);
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
      async (pos) => {
        const place = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
        setQueryText(place.shortName);
        onChange(place);
        setIsOpen(false);
        setLocating(false);
      },
      () => {
        setGeoError('Location permission denied. Try searching an address or preset corridor.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 7000 }
    );
  };

  return (
    <div ref={wrapperRef} className="relative">
      <label htmlFor={id} className="block text-xs font-semibold text-slate-700 mb-1.5">
        {label}
      </label>
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
          <input
            id={id}
            type="text"
            value={queryText}
            onChange={(e) => {
              setQueryText(e.target.value);
              if (e.target.value.trim().length < 3) {
                setResults([]);
                setIsOpen(false);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void runSearch(queryText);
              }
            }}
            placeholder={placeholder}
            className="w-full h-10 pl-3 pr-9 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-teal-600"
          />
          <button
            type="button"
            onClick={() => void runSearch(queryText)}
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

      {geoError && <p className="text-xs text-red-600 mt-1">{geoError}</p>}

      {isOpen && results.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-56 overflow-y-auto divide-y divide-slate-100"
        >
          {results.map((item, idx) => (
            <li key={`${item.lat}-${item.lng}-${idx}`}>
              <button
                type="button"
                onClick={() => {
                  onChange(item);
                  setQueryText(item.shortName);
                  setIsOpen(false);
                }}
                className="w-full text-left px-3 py-2.5 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <p className="text-xs font-semibold text-slate-900 truncate">{item.shortName}</p>
                <p className="text-[11px] text-slate-500 truncate mt-0.5">{item.label}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
