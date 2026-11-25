import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import { LogOut } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Header } from './components/Header';
import { LiveJourneyView } from './components/LiveJourneyView';
import { PoliceDispatchView } from './components/PoliceDispatchView';
import { ReportHazardView } from './components/ReportHazardView';
import { RoutePlannerView } from './components/RoutePlannerView';
import { SafeHerAiDrawer } from './components/SafeHerAiDrawer';
import { SosModal } from './components/SosModal';
import { WelcomeView } from './components/WelcomeView';
import { buildAiContextSnapshot } from './services/aiClient';
import { auth, googleProvider } from './services/firebase';
import {
  checkPoliceAuthorization,
  createLiveJourney,
  ensureUserProfile,
  subscribeActiveUnsafeReports,
  subscribeAllIncidents,
  subscribeMyIncidents,
  subscribeMyJourneys,
  subscribeUserContacts,
} from './services/firestoreService';
import {
  AiActionType,
  AnalyzedRoute,
  AppTab,
  EmergencyContact,
  EmergencyIncident,
  Journey,
  TimeOfTravel,
  TravelMode,
  UnsafeReport,
} from './types/safeher';

function AppShell() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [isAdmin, setIsAdmin] = useState(false);
  const [isPolice, setIsPolice] = useState(false);

  const [activeTab, setActiveTab] = useState<AppTab>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('track') ? 'journey' : 'planner';
  });

  const [initialTrackCode] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('track')?.toUpperCase() || null;
  });

  const [unsafeReports, setUnsafeReports] = useState<UnsafeReport[]>([]);
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [myJourneys, setMyJourneys] = useState<Journey[]>([]);
  const [myIncidents, setMyIncidents] = useState<EmergencyIncident[]>([]);
  const [policeIncidents, setPoliceIncidents] = useState<EmergencyIncident[]>([]);

  const [activeRoute, setActiveRoute] = useState<AnalyzedRoute | null>(null);
  const [plannerContext, setPlannerContext] = useState<{
    originLabel?: string;
    destinationLabel?: string;
    originCoords?: { lat: number; lng: number };
    travelMode?: TravelMode;
    timeOfTravel?: TimeOfTravel;
    routes: AnalyzedRoute[];
    selectedRoute: AnalyzedRoute | null;
  }>({ routes: [], selectedRoute: null });
  const [selectedRouteIdOverride, setSelectedRouteIdOverride] = useState<string | null>(null);

  const [isStartingJourney, setIsStartingJourney] = useState(false);
  const [sosModalOpen, setSosModalOpen] = useState(false);

  // SafeHer AI Assistant Drawer state
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
  const [aiDrawerMode, setAiDrawerMode] = useState<'chat' | 'voice'>('chat');
  const [pendingAiPrompt, setPendingAiPrompt] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          await ensureUserProfile(currentUser);
          const roleInfo = await checkPoliceAuthorization(currentUser);
          setIsAdmin(roleInfo.isAdmin);
          setIsPolice(roleInfo.isPolice);
        } catch (err) {
          console.error(err);
        }
      } else {
        setIsAdmin(false);
        setIsPolice(false);
      }
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!authReady || !user) {
      setUnsafeReports([]);
      setContacts([]);
      setMyJourneys([]);
      setMyIncidents([]);
      setPoliceIncidents([]);
      return;
    }

    const unsubReports = subscribeActiveUnsafeReports(setUnsafeReports);
    const unsubContacts = subscribeUserContacts(user.uid, setContacts);
    const unsubJourneys = subscribeMyJourneys(user.uid, setMyJourneys);
    const unsubMyInc = subscribeMyIncidents(user.uid, setMyIncidents);

    let unsubPoliceInc: (() => void) | undefined;
    if (isPolice) {
      unsubPoliceInc = subscribeAllIncidents(setPoliceIncidents);
    }

    return () => {
      unsubReports();
      unsubContacts();
      unsubJourneys();
      unsubMyInc();
      if (unsubPoliceInc) unsubPoliceInc();
    };
  }, [authReady, user?.uid, isPolice]);

  const handleSignIn = async () => {
    setIsSigningIn(true);
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to sign in with Google.';
      setAuthError(msg);
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleStartLiveJourney = async (
    route: AnalyzedRoute,
    originLabel: string,
    destinationLabel: string
  ) => {
    if (!user) return;
    setIsStartingJourney(true);
    try {
      await createLiveJourney(user, route, originLabel, destinationLabel);
      setActiveRoute(route);
      setActiveTab('journey');
    } finally {
      setIsStartingJourney(false);
    }
  };

  const handleOpenAi = useCallback((prefillPrompt?: string, mode: 'chat' | 'voice' = 'chat') => {
    setAiDrawerMode(mode);
    if (prefillPrompt) {
      setPendingAiPrompt(prefillPrompt);
    }
    setAiDrawerOpen(true);
  }, []);

  const activeJourney =
    myJourneys.find((j) => j.status === 'active' || j.status === 'sos') || null;

  const activeUserIncident =
    myIncidents.find(
      (i) => i.status === 'active' || i.status === 'acknowledged' || i.status === 'dispatched'
    ) || null;

  const activeSosCount = isPolice
    ? policeIncidents.filter((i) => i.status === 'active').length
    : activeUserIncident
    ? 1
    : 0;

  const aiContext = useMemo(
    () =>
      buildAiContextSnapshot({
        activeTab,
        originLabel: plannerContext.originLabel,
        destinationLabel: plannerContext.destinationLabel,
        originCoords: plannerContext.originCoords,
        travelMode: plannerContext.travelMode,
        timeOfTravel: plannerContext.timeOfTravel,
        routes: plannerContext.routes,
        selectedRoute: plannerContext.selectedRoute || activeRoute,
        activeJourney,
        contacts,
        unsafeReports,
      }),
    [
      activeTab,
      plannerContext,
      activeRoute,
      activeJourney,
      contacts,
      unsafeReports,
    ]
  );

  const handleAiSuggestedAction = (actionType: AiActionType) => {
    switch (actionType) {
      case 'open_sos':
        setSosModalOpen(true);
        break;
      case 'view_contacts':
        setActiveTab('journey');
        setAiDrawerOpen(false);
        break;
      case 'start_journey': {
        const rec =
          plannerContext.routes.find((r) => r.isRecommended) ||
          plannerContext.selectedRoute ||
          plannerContext.routes[0];
        if (rec && plannerContext.originLabel && plannerContext.destinationLabel) {
          void handleStartLiveJourney(
            rec,
            plannerContext.originLabel,
            plannerContext.destinationLabel
          );
          setAiDrawerOpen(false);
        } else {
          setActiveTab('planner');
          setAiDrawerOpen(false);
        }
        break;
      }
      case 'report_hazard':
        setActiveTab('report');
        setAiDrawerOpen(false);
        break;
      case 'focus_recommended_route': {
        const rec = plannerContext.routes.find((r) => r.isRecommended);
        if (rec) {
          setSelectedRouteIdOverride(rec.id);
        }
        setActiveTab('planner');
        break;
      }
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <Header
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        user={user}
        onTriggerSos={() => setSosModalOpen(true)}
        onSignIn={() => void handleSignIn()}
        activeSosCount={activeSosCount}
      />

      {!authReady ? (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-sm text-slate-500">Initializing SafeHer workspace...</div>
        </div>
      ) : !user ? (
        <div className="flex-1">
          <WelcomeView
            onSignIn={() => void handleSignIn()}
            authError={authError}
            isSigningIn={isSigningIn}
          />
        </div>
      ) : (
        <div className="flex-1">
          {activeTab === 'planner' && (
            <RoutePlannerView
              user={user}
              unsafeReports={unsafeReports}
              onStartLiveJourney={(route, orig, dest) =>
                void handleStartLiveJourney(route, orig, dest)
              }
              isStartingJourney={isStartingJourney}
              onRoutesUpdated={setPlannerContext}
              onAskAi={handleOpenAi}
              selectedRouteIdOverride={selectedRouteIdOverride}
            />
          )}

          {activeTab === 'journey' && (
            <LiveJourneyView
              user={user}
              activeJourney={activeJourney}
              activeRoute={activeRoute}
              myJourneys={myJourneys}
              contacts={contacts}
              initialTrackCode={initialTrackCode}
              onTriggerSos={() => setSosModalOpen(true)}
              onAskAi={handleOpenAi}
            />
          )}

          {activeTab === 'report' && (
            <ReportHazardView
              user={user}
              unsafeReports={unsafeReports}
              onAskAi={handleOpenAi}
            />
          )}

          {activeTab === 'police' && (
            <PoliceDispatchView
              user={user}
              isPolice={isPolice}
              isAdmin={isAdmin}
              onAskAi={handleOpenAi}
            />
          )}
        </div>
      )}

      <footer className="border-t border-slate-200 bg-white mt-auto">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
          <span>
            SafeHer — Intelligent Women’s Route Safety &amp; Emergency Assistance
          </span>
          {user && (
            <div className="flex items-center gap-4">
              <span>
                Signed in as <strong className="text-slate-700">{user.email}</strong>
                {isAdmin ? ' · Admin Dispatcher' : isPolice ? ' · Authorized Officer' : ''}
              </span>
              <button
                type="button"
                onClick={() => void signOut(auth)}
                className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-950 font-medium cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          )}
        </div>
      </footer>

      {user && (
        <>
          <SafeHerAiDrawer
            isOpen={aiDrawerOpen}
            initialMode={aiDrawerMode}
            onOpen={(mode = 'chat') => {
              setAiDrawerMode(mode);
              setAiDrawerOpen(true);
            }}
            onClose={() => setAiDrawerOpen(false)}
            user={user}
            context={aiContext}
            contacts={contacts}
            pendingPrompt={pendingAiPrompt}
            onConsumePendingPrompt={() => setPendingAiPrompt(null)}
            onAction={handleAiSuggestedAction}
          />
          <SosModal
            isOpen={sosModalOpen}
            onClose={() => setSosModalOpen(false)}
            user={user}
            activeJourney={activeJourney}
            activeRoute={activeRoute || plannerContext.selectedRoute}
            activeIncident={activeUserIncident}
            contacts={contacts}
            onAskEmergencyAi={handleOpenAi}
          />
        </>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppShell />
    </ErrorBoundary>
  );
}
