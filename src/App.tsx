import React, { useState } from 'react';
import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { MarketProvider, useMarket } from './contexts/MarketContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AppShell } from './components/AppShell';
import { ApiSetupModal } from './components/ApiSetupModal';
import { Home } from './pages/Home';
import { RacesCatalog } from './pages/RacesCatalog';
import { AuthOnboarding } from './pages/AuthOnboarding';
import { MyTrades } from './pages/MyTrades';
import { RaceDetail } from './pages/RaceDetail';
import { CreatorProfile } from './pages/CreatorProfile';
import { UserProfile } from './pages/UserProfile';
import { LaunchRace } from './pages/LaunchRace';
import { BrandsHub } from './pages/BrandsHub';
import { AdminDesk } from './pages/AdminDesk';
import { Predict } from './pages/Predict';

function OnboardingGate({
  children,
}: {
  children: React.ReactNode;
  skipFirstVisitRedirect?: boolean;
}) {
  return <>{children}</>;
}

function AppRouter() {
  const [showApiSetup, setShowApiSetup] = useState(false);
  const { isAdmin } = useMarket();

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Routes>
          <Route path="/auth" element={<AuthOnboarding />} />
          <Route path="/onboarding" element={<AuthOnboarding />} />
          <Route
            path="/"
            element={
              <OnboardingGate>
                <Home onOpenApiSetup={() => setShowApiSetup(true)} />
              </OnboardingGate>
            }
          />
          <Route
            path="/races"
            element={
              <OnboardingGate>
                <RacesCatalog onOpenApiSetup={() => setShowApiSetup(true)} />
              </OnboardingGate>
            }
          />
          <Route
            path="/predict"
            element={
              <OnboardingGate>
                <Predict onOpenApiSetup={() => setShowApiSetup(true)} />
              </OnboardingGate>
            }
          />
          <Route
            path="/race/:id"
            element={
              <OnboardingGate skipFirstVisitRedirect>
                <RaceDetail onOpenApiSetup={() => setShowApiSetup(true)} />
              </OnboardingGate>
            }
          />
          <Route
            path="/trades"
            element={
              <OnboardingGate>
                <MyTrades />
              </OnboardingGate>
            }
          />
          <Route
            path="/profile"
            element={
              <OnboardingGate skipFirstVisitRedirect>
                <UserProfile />
              </OnboardingGate>
            }
          />
          <Route
            path="/creators"
            element={
              <OnboardingGate>
                <CreatorProfile onOpenApiSetup={() => setShowApiSetup(true)} />
              </OnboardingGate>
            }
          />
          <Route
            path="/creator/:id"
            element={
              <OnboardingGate skipFirstVisitRedirect>
                <CreatorProfile onOpenApiSetup={() => setShowApiSetup(true)} />
              </OnboardingGate>
            }
          />
          <Route
            path="/launch-race"
            element={
              <OnboardingGate>
                <LaunchRace onOpenApiSetup={() => setShowApiSetup(true)} />
              </OnboardingGate>
            }
          />
          <Route
            path="/brands"
            element={
              <OnboardingGate>
                <BrandsHub onOpenApiSetup={() => setShowApiSetup(true)} />
              </OnboardingGate>
            }
          />
          <Route
            path="/admin"
            element={
              <OnboardingGate skipFirstVisitRedirect>
                <AdminDesk onOpenApiSetup={() => setShowApiSetup(true)} />
              </OnboardingGate>
            }
          />
          <Route path="/dashboard" element={<Navigate to="/brands" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      {isAdmin && showApiSetup && <ApiSetupModal onClose={() => setShowApiSetup(false)} />}
    </AppShell>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <LanguageProvider>
          <AuthProvider>
            <MarketProvider>
              <BrowserRouter>
                <AppRouter />
              </BrowserRouter>
            </MarketProvider>
          </AuthProvider>
        </LanguageProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
