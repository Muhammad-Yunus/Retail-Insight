import { useCallback, useEffect, useState } from 'react';
import { Bell, Calendar, Download, Menu, Settings, X } from 'lucide-react';
import {
  ConfigAndAuthModal,
  type ModalTab,
} from './components/ConfigAndAuthModal.tsx';
import { LiveDetectionPlayer } from './components/LiveDetectionPlayer.tsx';
import { NeedsAttentionCard } from './components/NeedsAttentionCard.tsx';
import { SecondaryViewPanel } from './components/SecondaryViewPanel.tsx';
import { Sidebar, type NavSection } from './components/Sidebar.tsx';
import { StaffingCard } from './components/StaffingCard.tsx';
import { StorePerformanceCard } from './components/StorePerformanceCard.tsx';
import { TodayAtGlanceCard } from './components/TodayAtGlanceCard.tsx';
import { useRetailSocket } from './hooks/useRetailSocket.ts';
import type {
  AttentionAlertRecord,
  AuthUser,
  DashboardPayload,
} from './types/retail.ts';

export default function App() {
  const [activeNav, setActiveNav] = useState<NavSection>('Overview');
  const [activeStoreId, setActiveStoreId] = useState<number>(3);
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);

  // Auth state held strictly in React memory (never localStorage/sessionStorage)
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [hasAdminUser, setHasAdminUser] = useState<boolean>(false);
  const [hasEnvPasscode, setHasEnvPasscode] = useState<boolean>(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<ModalTab>('stream');
  const [bellOpen, setBellOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const loadDashboard = useCallback(async (storeId: number) => {
    try {
      const res = await fetch(`/api/dashboard?storeId=${storeId}`);
      if (res.ok) {
        const data = (await res.json()) as DashboardPayload;
        setDashboard(data);
      }
    } catch {
      // keep previous snapshot on transient fetch error
    }
  }, []);

  const loadAuthStatus = useCallback(async (token: string | null) => {
    try {
      const res = await fetch('/api/auth/status', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = (await res.json()) as {
          hasAdminUser: boolean;
          hasEnvPasscode: boolean;
          authenticated: boolean;
          user: AuthUser | null;
        };
        setHasAdminUser(data.hasAdminUser);
        setHasEnvPasscode(data.hasEnvPasscode);
        if (data.authenticated && data.user) {
          setCurrentUser(data.user);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadDashboard(activeStoreId);
  }, [activeStoreId, loadDashboard]);

  useEffect(() => {
    loadAuthStatus(authToken);
  }, [authToken, loadAuthStatus]);

  const { latestFrame, wsConnected } = useRetailSocket(
    activeStoreId,
    useCallback((updatedPayload: DashboardPayload) => {
      setDashboard(updatedPayload);
    }, [])
  );

  function openModal(tab: ModalTab) {
    setModalTab(tab);
    setModalOpen(true);
  }

  function handleSelectNav(nav: NavSection) {
    if (nav === 'Settings') {
      openModal('stream');
      setMobileMenuOpen(false);
      return;
    }
    setActiveNav(nav);
    setMobileMenuOpen(false);
  }

  async function handleAckZoneAlert() {
    if (!authToken) {
      openModal('auth');
      return;
    }
    const res = await fetch('/api/zone-alert/ack', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ storeId: activeStoreId }),
    });
    if (res.ok) {
      await loadDashboard(activeStoreId);
    }
  }

  async function handleAlertAction(alert: AttentionAlertRecord) {
    if (alert.title === 'Camera Offline') {
      setActiveStoreId(alert.storeId);
      openModal('stream');
      return;
    }
    if (!authToken) {
      openModal('auth');
      return;
    }
    const res = await fetch(`/api/alerts/${alert.id}/ack`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (res.ok) {
      await loadDashboard(activeStoreId);
    }
  }

  function handleExportCsv() {
    window.location.href = `/api/export/csv?storeId=${activeStoreId}`;
  }

  if (!dashboard) {
    return (
      <div className="min-h-screen bg-[#F5F6F8] flex items-center justify-center">
        <div className="text-[13px] font-medium text-[#6B7280]">
          Loading Retail Insight...
        </div>
      </div>
    );
  }

  const activeStore =
    dashboard.stores.find((s) => s.id === activeStoreId) ?? dashboard.stores[0];
  const detectionFrame =
    latestFrame && latestFrame.storeId === activeStore.id
      ? latestFrame
      : dashboard.latestDetections;

  return (
    <div className="min-h-screen bg-[#ECEEF2] p-0 sm:p-2.5 lg:p-4 flex items-stretch justify-center">
      {/* Main Application Window Shell matching reference framing */}
      <div className="w-full max-w-[1440px] bg-white sm:rounded-[22px] shadow-[0_20px_50px_rgba(15,23,42,0.08)] border border-white/80 overflow-hidden flex min-h-[820px]">
        {/* Desktop Sidebar */}
        <div className="hidden lg:flex">
          <Sidebar
            activeNav={activeNav}
            onSelectNav={handleSelectNav}
            onOpenAccount={() => openModal('auth')}
            currentUser={currentUser}
          />
        </div>

        {/* Mobile Drawer Sidebar */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-40 lg:hidden flex">
            <div
              className="fixed inset-0 bg-slate-900/30"
              onClick={() => setMobileMenuOpen(false)}
            />
            <div className="relative z-50 flex">
              <Sidebar
                activeNav={activeNav}
                onSelectNav={handleSelectNav}
                onOpenAccount={() => {
                  setMobileMenuOpen(false);
                  openModal('auth');
                }}
                currentUser={currentUser}
              />
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="absolute top-4 right-3 p-1.5 rounded-lg bg-white/80 text-[#374151]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Main Content Viewport */}
        <main className="flex-1 bg-[#FFFFFF] px-5 py-5 sm:px-7 sm:py-6 overflow-x-hidden flex flex-col">
          {/* Top Header Bar (100% matching reference) */}
          <header className="flex flex-wrap items-center justify-between gap-4 mb-5">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="lg:hidden p-2 rounded-lg border border-[#E5E7EB] text-[#374151]"
                aria-label="Open menu"
              >
                <Menu className="w-4 h-4" />
              </button>
              <div>
                <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-[#111827] leading-tight">
                  {activeNav}
                </h1>
                <p className="text-[12px] text-[#6B7280] mt-0.5">
                  Live Retail Analytics &amp; Monitoring
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 relative">
              {/* Date Selector Chip */}
              <button
                type="button"
                onClick={() => loadDashboard(activeStoreId)}
                title="Refresh Today Snapshot"
                className="h-9 px-3.5 rounded-[10px] bg-white border border-[#E5E7EB] hover:bg-gray-50 flex items-center gap-2 text-[12px] transition-colors whitespace-nowrap"
              >
                <Calendar className="w-3.5 h-3.5 text-[#6B7280]" />
                <span className="font-medium text-[#111827]">Today</span>
                <span className="text-[#6B7280]">{dashboard.summary.dateLabel}</span>
              </button>

              {/* Export Primary CTA */}
              <button
                type="button"
                onClick={handleExportCsv}
                className="h-9 px-4 rounded-[10px] bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[12.5px] font-medium flex items-center gap-2 shadow-[0_2px_6px_rgba(37,99,235,0.24)] transition-colors whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export</span>
              </button>

              {/* Bell Icon Button */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setBellOpen((v) => !v)}
                  aria-label="Notifications"
                  className="w-9 h-9 rounded-[10px] bg-white border border-[#E5E7EB] hover:bg-gray-50 flex items-center justify-center text-[#374151] transition-colors"
                >
                  <Bell className="w-4 h-4" strokeWidth={1.8} />
                </button>
                {bellOpen && (
                  <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl border border-[#EAECEF] shadow-xl p-3 z-30">
                    <div className="text-[12px] font-semibold text-[#111827] mb-2">
                      Active Store Alerts
                    </div>
                    <div className="space-y-2">
                      {dashboard.alerts.map((a) => (
                        <div
                          key={a.id}
                          className="p-2 rounded-lg bg-[#F8FAFC] border border-[#F1F5F9] text-[11.5px]"
                        >
                          <div className="font-semibold text-[#111827]">
                            {a.storeCode} · {a.title}
                          </div>
                          <div className="text-[#6B7280] mt-0.5 line-clamp-2">
                            {a.description}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Settings Icon Button */}
              <button
                type="button"
                onClick={() => openModal('stream')}
                aria-label="Stream & API Settings"
                title="Stream URL, YOLO API & Auth Settings"
                className="w-9 h-9 rounded-[10px] bg-white border border-[#E5E7EB] hover:bg-gray-50 flex items-center justify-center text-[#374151] transition-colors"
              >
                <Settings className="w-4 h-4" strokeWidth={1.8} />
              </button>
            </div>
          </header>

          {activeNav === 'Overview' ? (
            <div className="space-y-4 flex-1 flex flex-col justify-between">
              {/* Top Section: 2:1 Asymmetric Split */}
              <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 items-stretch">
                <LiveDetectionPlayer
                  stores={dashboard.stores}
                  activeStore={activeStore}
                  detectionFrame={detectionFrame}
                  zoneAlert={dashboard.zoneAlert}
                  onSelectStore={setActiveStoreId}
                  onAckZoneAlert={handleAckZoneAlert}
                  onOpenStreamConfig={() => openModal('stream')}
                />

                <div className="flex flex-col gap-4">
                  <TodayAtGlanceCard
                    totalFootfall={dashboard.summary.totalFootfall}
                    footfallDeltaPct={dashboard.summary.footfallDeltaPct}
                    conversionPct={dashboard.summary.conversionPct}
                    estimatedBuyers={dashboard.summary.estimatedBuyers}
                    intervals={dashboard.intervals}
                  />
                  <StaffingCard staffing={dashboard.staffing} />
                </div>
              </div>

              {/* Bottom Section: 44/56 Split matching reference */}
              <div className="grid grid-cols-1 lg:grid-cols-[44fr_56fr] gap-4 items-stretch">
                <StorePerformanceCard
                  stores={dashboard.stores}
                  activeStoreId={activeStore.id}
                  onSelectStore={setActiveStoreId}
                  onOpenStoreConfig={() => openModal('stream')}
                />
                <NeedsAttentionCard
                  alerts={dashboard.alerts}
                  onActionAlert={handleAlertAction}
                />
              </div>
            </div>
          ) : (
            <SecondaryViewPanel
              section={activeNav === 'Settings' ? 'Stores' : activeNav}
              dashboard={dashboard}
              onBackToOverview={() => setActiveNav('Overview')}
              onSelectStore={setActiveStoreId}
              onOpenConfig={() => openModal('stream')}
            />
          )}
        </main>
      </div>

      {/* Config, Ingestion API & Auth Modal */}
      <ConfigAndAuthModal
        isOpen={modalOpen}
        initialTab={modalTab}
        onClose={() => setModalOpen(false)}
        activeStore={activeStore}
        authToken={authToken}
        currentUser={currentUser}
        hasAdminUser={hasAdminUser}
        hasEnvPasscode={hasEnvPasscode}
        wsConnected={wsConnected}
        dbBackend={dashboard.dbBackend}
        onAuthSuccess={(token, user) => {
          setAuthToken(token);
          setCurrentUser(user);
          setHasAdminUser(true);
        }}
        onLogout={() => {
          setAuthToken(null);
          setCurrentUser(null);
        }}
        onStreamUpdated={() => loadDashboard(activeStoreId)}
      />
    </div>
  );
}
