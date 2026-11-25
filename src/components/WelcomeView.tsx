
import { useState } from 'react';
import { Compass, MapPin, Navigation, Radio, ShieldCheck, Siren } from 'lucide-react';

interface WelcomeViewProps {
  onSignIn: () => void;
  onContinueAsGuest: () => void;
  authError: string | null;
  isSigningIn: boolean;
}

export function WelcomeView({
  onSignIn,
  onContinueAsGuest,
  authError,
  isSigningIn,
}: WelcomeViewProps) {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <main className="max-w-[1440px] mx-auto px-4 sm:px-6 py-10 lg:py-16">
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
        <div className="lg:col-span-6 flex flex-col justify-between bg-white border border-slate-200 rounded-xl p-6 sm:p-8 lg:p-10">
          <div>
            <p className="text-xs font-medium tracking-wide text-teal-700 mb-3">
              Women’s Route Safety &amp; Emergency Dispatch
            </p>
            <h1 className="font-display text-3xl sm:text-4xl lg:text-[42px] font-bold tracking-tight text-slate-950 leading-[1.15] text-balance mb-5">
              Choose the safest route home, not just the shortest one.
            </h1>
            <p className="text-base text-slate-600 leading-relaxed max-w-xl mb-7">
              SafeHer analyzes every alternative corridor between your origin and destination—evaluating street lighting, active storefronts, CCTV coverage, nearby police posts, and community hazard reports in real time.
            </p>

            <div className="flex flex-col gap-3 w-full sm:max-w-sm mb-5">
              <button
                type="button"
                onClick={onSignIn}
                disabled={isSigningIn}
                className="w-full inline-flex items-center justify-center gap-2.5 px-6 py-3 bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2"
              >
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>{isSigningIn ? 'Connecting Account...' : 'Sign in with Google to Start'}</span>
              </button>

              <button
                type="button"
                onClick={onContinueAsGuest}
                disabled={isSigningIn}
                className="w-full inline-flex items-center justify-center gap-2.5 px-6 py-3 bg-white hover:bg-slate-50 disabled:opacity-60 text-slate-950 text-sm font-semibold border border-slate-900 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
              >
                <Compass className="w-4 h-4 text-teal-700 shrink-0" />
                <span>Continue as Guest</span>
              </button>
            </div>

            <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600 leading-relaxed mb-6">
              <p className="font-semibold text-slate-900 mb-1">
                Explore immediately without an account
              </p>
              <p>
                Guest users can access route search, route safety scoring, interactive maps, and AI safety analysis. Emergency SOS alerts, live family sharing, and saved journey history require Google Sign-In.
              </p>
            </div>

            {authError && (
              <div
                role="alert"
                className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800 mb-6"
              >
                {authError}
              </div>
            )}
          </div>

          <div className="pt-6 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="flex items-start gap-3">
              <Navigation className="w-4 h-4 text-teal-700 mt-0.5 shrink-0" />
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Multi-Route Safety Scoring</h2>
                <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                  Compares OSRM road alternatives with OpenStreetMap lighting, shops, CCTV, and police proximity.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Radio className="w-4 h-4 text-teal-700 mt-0.5 shrink-0" />
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Live Family Journey Sharing</h2>
                <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                  Share a live tracking code with trusted family contacts for real-time ETA monitoring.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Siren className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Instant SOS &amp; Police Dispatch</h2>
                <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                  Broadcasts live coordinates and nearest station details directly to the authorized police console.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <MapPin className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Community Hazard Reports</h2>
                <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                  Report broken streetlights or isolated stretches to automatically adjust corridor safety scores.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-6 relative rounded-xl overflow-hidden border border-slate-200 bg-slate-900 min-h-[340px]">
          {!imgFailed ? (
            <img
              src="/src/assets/images/safeher_evening_commute_1795533993848.jpg"
              alt="Woman walking calmly along a well-lit urban boulevard with open cafes and streetlights at dusk"
              referrerPolicy="no-referrer"
              onError={() => setImgFailed(true)}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center p-10 bg-gradient-to-br from-slate-900 via-teal-950 to-slate-900 text-white">
              <ShieldCheck className="w-12 h-12 text-teal-400 mb-3" />
              <p className="font-display text-lg font-semibold">SafeHer Navigation Network</p>
              <p className="text-sm text-slate-300 mt-1 text-center max-w-sm">
                Real-time route safety intelligence and coordinated emergency response.
              </p>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/25 to-transparent pointer-events-none" />
          <div className="absolute bottom-0 inset-x-0 p-6 sm:p-8 text-white">
            <p className="text-xs font-medium text-teal-300 mb-1.5">
              Powered by OpenStreetMap · OSRM · Cloud Firestore
            </p>
            <p className="text-sm sm:text-base text-slate-100 leading-relaxed max-w-lg">
              Sign in with Google for emergency SOS alerts, live family sharing, and saved journey history—or continue as a guest to search routes and compare corridor safety indicators.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
