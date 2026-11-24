import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { sendEmailVerification, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../services/firebase';
import { useAuth, detectMomoProvider } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useMarket } from '../contexts/MarketContext';
import { CrippoLogo } from '../components/CrippoLogo';

const CITIES = ['Douala', 'Buea', 'Yaoundé', 'Limbe', 'Bafoussam'];
const INTERESTS = [
  'Music Albums',
  'TikTok Series',
  'Movies & Docs',
  'YouTube Shows',
  'Podcasts',
  'Cultural Predictions',
];

export function AuthOnboarding() {
  const {
    user,
    emailVerified,
    profile,
    privateInfo,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    refreshUser,
    completeOnboarding,
  } = useAuth();
  const { showToast } = useMarket();
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const rawReturnTo = searchParams.get('returnTo');
  const returnTo = rawReturnTo && rawReturnTo.startsWith('/') ? rawReturnTo : '/';
  const skipSplash = searchParams.get('skipSplash') === '1' || searchParams.get('mode') === 'login' || searchParams.get('mode') === 'signup';
  const requestedMode = searchParams.get('mode') === 'signup' ? 'signup' : 'login';

  const [showSplash, setShowSplash] = useState<boolean>(!user && !skipSplash);
  const [step, setStep] = useState<1 | 2>(user ? 2 : 1);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>(requestedMode);

  const handleContinueAsGuest = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('crippo_guest_onboarded', '1');
    }
    navigate(returnTo, { replace: true });
  };
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');

  const [displayName, setDisplayName] = useState(profile?.displayName || user?.displayName || '');
  const [city, setCity] = useState(profile?.city || 'Douala');
  const [phone, setPhone] = useState(privateInfo?.phone || '2376');
  const [interests, setInterests] = useState<string[]>(
    profile?.interests?.length ? profile.interests : ['Music Albums', 'TikTok Series']
  );

  useEffect(() => {
    if (user && profile?.onboardingComplete) {
      navigate(returnTo, { replace: true });
      return;
    }
    if (user) {
      setShowSplash(false);
      setStep(2);
      if (!displayName && user.displayName) setDisplayName(user.displayName);
    } else {
      setStep(1);
    }
  }, [user, profile?.onboardingComplete, displayName, navigate, returnTo]);

  useEffect(() => {
    if (profile?.displayName) setDisplayName(profile.displayName);
    if (profile?.city) setCity(profile.city);
    if (privateInfo?.phone) setPhone(privateInfo.phone);
    if (profile?.interests?.length) setInterests(profile.interests);
  }, [profile, privateInfo]);

  const detectedCarrier = detectMomoProvider(phone);

  const previewAlias = React.useMemo(() => {
    if (profile?.anonymousId) return profile.anonymousId;
    if (!user) return 'Member #4829';
    let hash = 0;
    for (let i = 0; i < user.uid.length; i++) {
      hash = (hash * 31 + user.uid.charCodeAt(i)) % 9000;
    }
    return `Trader #${1000 + Math.abs(hash)}`;
  }, [profile, user]);

  const formatFirebaseAuthError = (err: unknown): string => {
    const raw = (err as { code?: string; message?: string })?.code || (err as Error)?.message || '';
    if (raw.includes('auth/operation-not-allowed')) {
      return 'Enable Email/Password and Google sign-in in Firebase Console -> Authentication -> Sign-in method.';
    }
    if (raw.includes('auth/unauthorized-domain')) {
      return 'Add this app domain to Firebase Console -> Authentication -> Settings -> Authorized domains.';
    }
    if (raw.includes('auth/email-already-in-use')) {
      return 'This email is already registered. Switch to Sign In above.';
    }
    if (raw.includes('auth/invalid-credential') || raw.includes('auth/wrong-password') || raw.includes('auth/user-not-found')) {
      return 'Incorrect email or password. Try again or use Forgot Password.';
    }
    if (raw.includes('auth/popup-closed-by-user')) {
      return 'Google sign-in popup was closed before completing.';
    }
    if (raw.includes('Missing or insufficient permissions') || raw.includes('permission-denied')) {
      return 'Database permissions need updating: paste /firestore.rules into Firebase Console -> Firestore Database -> Rules and click Publish.';
    }
    return (err as Error)?.message || 'Authentication failed.';
  };

  const handleGoogle = async () => {
    setBusy(true);
    setErrorMsg('');
    try {
      await signInWithGoogle();
      showToast(
        lang === 'fr' ? 'Connecté' : 'Signed In',
        lang === 'fr' ? 'Confirmez votre ligne Mobile Money.' : 'Confirm your Mobile Money line to finish setup.'
      );
    } catch (err: unknown) {
      setErrorMsg(formatFirebaseAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || password.length < 6) {
      setErrorMsg(
        lang === 'fr'
          ? 'Email valide et mot de passe de 6+ caractères requis.'
          : 'Valid email and password (6+ chars) required.'
      );
      return;
    }
    setBusy(true);
    setErrorMsg('');
    setInfoMsg('');
    try {
      if (authMode === 'login') {
        await signInWithEmail(email.trim(), password);
      } else {
        await signUpWithEmail(email.trim(), password);
        setInfoMsg(
          lang === 'fr'
            ? 'Compte créé ! Cliquez sur le lien de vérification dans votre boîte mail, puis cliquez sur Actualiser.'
            : 'Account created! Open the verification link sent to your email inbox, then click Refresh.'
        );
      }
    } catch (err: unknown) {
      setErrorMsg(formatFirebaseAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleResetPassword = async () => {
    if (!email.trim()) {
      setErrorMsg(
        lang === 'fr'
          ? 'Entrez votre email ci-dessus pour recevoir le lien.'
          : 'Enter your email address above to receive a reset link.'
      );
      return;
    }
    setBusy(true);
    setErrorMsg('');
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setInfoMsg(
        lang === 'fr'
          ? 'Lien de réinitialisation envoyé à votre adresse email.'
          : 'Password reset link dispatched to your inbox.'
      );
    } catch (err: unknown) {
      setErrorMsg((err as Error).message || 'Failed to send reset link.');
    } finally {
      setBusy(false);
    }
  };

  const handleResendVerification = async () => {
    if (!auth.currentUser) return;
    setBusy(true);
    setErrorMsg('');
    try {
      await sendEmailVerification(auth.currentUser);
      setInfoMsg(
        lang === 'fr'
          ? 'Email renvoyé. Ouvrez le lien puis cliquez sur Actualiser.'
          : 'Verification email resent. Open the link then click Refresh.'
      );
    } catch (err: unknown) {
      setErrorMsg((err as Error).message || 'Could not resend email.');
    } finally {
      setBusy(false);
    }
  };

  const handleRefreshSession = async () => {
    if (!auth.currentUser) return;
    setBusy(true);
    setErrorMsg('');
    try {
      const verified = await refreshUser();
      if (verified) {
        setInfoMsg('');
        showToast('Email Verified', 'Your Crippo account is verified for XAF Mobile Money.');
      } else {
        setErrorMsg('Email is still unverified. Check spam or click the link in your inbox.');
      }
    } catch (err: unknown) {
      setErrorMsg(formatFirebaseAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const toggleInterest = (tag: string) => {
    setInterests((prev) =>
      prev.includes(tag) ? prev.filter((i) => i !== tag) : [...prev, tag].slice(0, 8)
    );
  };

  const handleSaveOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!displayName.trim()) {
      setErrorMsg(lang === 'fr' ? 'Nom requis.' : 'Full display name is required.');
      return;
    }
    setBusy(true);
    setErrorMsg('');
    try {
      await completeOnboarding({
        displayName,
        city,
        phone,
        interests,
      });
      showToast(
        lang === 'fr' ? 'Compte Activé' : 'Account Ready',
        `${displayName.trim()} · ${city} · ${detectedCarrier} MoMo`
      );
      navigate(returnTo, { replace: true });
    } catch (err: unknown) {
      setErrorMsg(formatFirebaseAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  if (showSplash && !user) {
    return (
      <div className="min-h-screen w-full overflow-x-hidden bg-surface flex flex-col justify-between px-4 sm:px-8 py-8">
        <div className="max-w-xl w-full mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <CrippoLogo size={32} />
            <span className="font-headline-sm font-bold text-on-surface">CRIPPO</span>
          </div>
          <button
            type="button"
            onClick={handleContinueAsGuest}
            aria-label="Skip and browse as guest"
            className="inline-flex items-center gap-1.5 text-on-surface-variant hover:text-on-surface font-label-md transition-colors"
          >
            <span>{lang === 'fr' ? 'Ignorer' : 'Skip'}</span>
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        <div className="max-w-xl w-full mx-auto flex flex-col items-start text-left gap-8 py-10">
          <div className="flex flex-col gap-3">
            <h1 className="font-display-lg-mobile sm:font-display-lg text-on-surface font-bold leading-tight">
              Grow with the creators you love.
            </h1>
            <p className="font-body-lg text-on-surface-variant leading-relaxed">
              Back rising musicians, filmmakers, and creators across Africa — or activate Creator Mode in your profile to launch a project Raise via MTN MoMo &amp; Orange Money.
            </p>
          </div>

          <div className="w-full grid grid-cols-1 sm:grid-cols-3 gap-6 border-y border-outline-variant/25 py-6">
            <div>
              <span className="font-label-xs uppercase text-secondary font-bold block">Supporters</span>
              <span className="font-body-sm text-on-surface-variant mt-1 block">
                Own revenue shares in upcoming creative releases.
              </span>
            </div>
            <div>
              <span className="font-label-xs uppercase text-secondary font-bold block">Creators &amp; Labels</span>
              <span className="font-body-sm text-on-surface-variant mt-1 block">
                Fund production budgets directly from your audience.
              </span>
            </div>
            <div>
              <span className="font-label-xs uppercase text-secondary font-bold block">Mobile Money</span>
              <span className="font-body-sm text-on-surface-variant mt-1 block">
                Direct FCFA settlements and royalty payouts.
              </span>
            </div>
          </div>

          <div className="w-full flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={() => {
                setAuthMode('signup');
                setShowSplash(false);
              }}
              className="flex-1 py-3.5 px-6 rounded-xl bg-secondary text-on-secondary font-headline-sm text-[15px] font-bold hover:opacity-95 transition-opacity"
            >
              Get Started / Sign In
            </button>
            <button
              type="button"
              onClick={handleContinueAsGuest}
              className="flex-1 py-3.5 px-6 rounded-xl border border-outline-variant/40 text-on-surface font-label-md font-bold hover:bg-surface-container-low transition-colors"
            >
              Browse as Guest
            </button>
          </div>
        </div>

        <div className="max-w-xl w-full mx-auto text-[12px] text-on-surface-variant">
          Direct XAF Mobile Money clearing · Douala · Yaoundé · Buea
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-surface flex flex-col justify-between px-4 sm:px-6 pt-8 sm:pt-12 pb-8 gap-6">
      <div className="max-w-xl w-full mx-auto flex flex-col gap-6">
        {/* Top Bar */}
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-outline-variant/25">
          <button
            type="button"
            onClick={handleContinueAsGuest}
            className="inline-flex items-center gap-1.5 font-label-xs uppercase text-on-surface-variant hover:text-secondary transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            <span>{lang === 'fr' ? 'Parcourir en Invité' : 'Browse as Guest'}</span>
          </button>
          <div className="flex items-center gap-4">
            {!user && (
              <button
                type="button"
                onClick={() => setShowSplash(true)}
                className="font-label-xs uppercase text-secondary hover:underline"
              >
                Overview
              </button>
            )}
            {!user && (
              <button
                type="button"
                onClick={handleContinueAsGuest}
                aria-label="Close authentication"
                className="w-8 h-8 rounded-lg hover:bg-surface-container-low flex items-center justify-center text-on-surface-variant"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            )}
          </div>
        </div>

        {/* Brand Masthead */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <CrippoLogo size={42} className="shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h1 className="font-display-lg-mobile md:font-headline-lg text-on-surface leading-tight font-bold">
                Crippo
              </h1>
              <p className="font-body-sm sm:font-body-md text-on-surface-variant mt-0.5">
                {lang === 'fr'
                  ? 'Un seul compte pour soutenir des projets, voter ou réclamer votre profil créateur.'
                  : 'One simple account for fans, listeners, and creators — switch on Creator Mode anytime in your profile.'}
              </p>
            </div>
          </div>

          {/* 2-Step Indicator */}
          <div className="grid grid-cols-2 sm:flex items-center gap-1.5 bg-surface-container p-1 rounded-xl w-full sm:w-auto shrink-0 border border-outline-variant/30">
            <button
              type="button"
              onClick={() => setStep(1)}
              className={`px-3 py-1.5 rounded-lg font-label-xs uppercase transition-colors text-center ${
                step === 1
                  ? 'bg-primary-container text-white'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              01. {lang === 'fr' ? 'Compte' : 'Sign In'}
            </button>
            <button
              type="button"
              onClick={() => user && setStep(2)}
              disabled={!user}
              className={`px-3 py-1.5 rounded-lg font-label-xs uppercase transition-colors disabled:opacity-40 text-center ${
                step === 2
                  ? 'bg-primary-container text-white'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              02. {lang === 'fr' ? 'MoMo' : 'Mobile Money'}
            </button>
          </div>
        </div>

        {/* Main Form Surface (Borderless on Page Background) */}
        {step === 1 ? (
          <div className="pt-4 border-t border-outline-variant/25 flex flex-col gap-5">
            <button
              type="button"
              disabled={busy}
              onClick={handleGoogle}
              className="w-full py-3.5 px-4 rounded-xl bg-primary-container text-white font-headline-sm text-[14px] sm:text-[15px] flex items-center justify-center gap-2.5 hover:opacity-95 transition-opacity"
            >
              <span className="truncate">
                {lang === 'fr' ? 'Continuer avec Google' : 'Continue with Google'}
              </span>
            </button>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-outline-variant/40" />
              <span className="font-label-xs uppercase text-on-surface-variant shrink-0">
                {lang === 'fr' ? 'ou avec Email' : 'or with Email'}
              </span>
              <div className="flex-1 h-px bg-outline-variant/40" />
            </div>

            <div className="grid grid-cols-2 bg-surface-container-low p-1 rounded-xl border border-outline-variant/30">
              <button
                type="button"
                onClick={() => setAuthMode('login')}
                className={`py-2 rounded-lg font-label-md text-[12px] sm:text-[13px] transition-colors ${
                  authMode === 'login'
                    ? 'bg-surface-container-lowest text-on-surface shadow-sm font-bold'
                    : 'text-on-surface-variant'
                }`}
              >
                {lang === 'fr' ? 'Connexion' : 'Sign In'}
              </button>
              <button
                type="button"
                onClick={() => setAuthMode('signup')}
                className={`py-2 rounded-lg font-label-md text-[12px] sm:text-[13px] transition-colors ${
                  authMode === 'signup'
                    ? 'bg-surface-container-lowest text-on-surface shadow-sm font-bold'
                    : 'text-on-surface-variant'
                }`}
              >
                {lang === 'fr' ? 'Créer un compte' : 'Create Account'}
              </button>
            </div>

            <form onSubmit={handleEmailSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="font-label-xs uppercase text-on-surface-variant">
                  {lang === 'fr' ? 'Adresse Email' : 'Email Address'}
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-3.5 py-3 rounded-xl bg-surface-container-low border border-outline-variant/40 text-on-surface font-body-md outline-none focus:ring-2 focus:ring-secondary"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="font-label-xs uppercase text-on-surface-variant">
                    {lang === 'fr' ? 'Mot de passe' : 'Password'}
                  </label>
                  <button
                    type="button"
                    onClick={handleResetPassword}
                    className="font-label-xs text-secondary hover:underline shrink-0"
                  >
                    {lang === 'fr' ? 'Mot de passe oublié ?' : 'Forgot Password?'}
                  </button>
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-3 rounded-xl bg-surface-container-low border border-outline-variant/40 text-on-surface font-body-md outline-none focus:ring-2 focus:ring-secondary"
                />
              </div>

              {errorMsg && (
                <div className="p-3 rounded-xl bg-error-container text-on-error-container font-body-sm">
                  {errorMsg}
                </div>
              )}
              {infoMsg && (
                <div className="p-3 rounded-xl bg-secondary-fixed text-on-surface font-body-sm">
                  {infoMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={busy}
                className="w-full py-3.5 rounded-xl bg-secondary text-on-secondary font-headline-sm text-[15px] font-bold hover:opacity-95 transition-opacity disabled:opacity-60"
              >
                {busy
                  ? '...'
                  : authMode === 'login'
                  ? lang === 'fr'
                    ? 'Se Connecter'
                    : 'Sign In'
                  : lang === 'fr'
                  ? 'Créer Mon Compte'
                  : 'Create Account'}
              </button>
            </form>
          </div>
        ) : (
          <div className="pt-4 border-t border-outline-variant/25 flex flex-col gap-5">
            {user && !emailVerified && (
              <div className="p-4 rounded-xl bg-error-container text-on-error-container flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex flex-col gap-0.5">
                  <span className="font-label-md font-bold">
                    {lang === 'fr' ? 'Vérification Email Requise' : 'Email Verification Required'}
                  </span>
                  <span className="font-body-sm">
                    {lang === 'fr'
                      ? 'Cliquez sur le lien reçu par email pour activer Mobile Money.'
                      : 'Confirm the verification link sent to your inbox before activating Mobile Money.'}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleResendVerification}
                    className="px-3 py-1.5 rounded-lg bg-surface-container-lowest text-on-surface font-label-xs uppercase"
                  >
                    Resend
                  </button>
                  <button
                    type="button"
                    onClick={handleRefreshSession}
                    className="px-3 py-1.5 rounded-lg bg-primary text-on-primary font-label-xs uppercase"
                  >
                    Refresh
                  </button>
                </div>
              </div>
            )}

            {/* Privacy Alias Banner */}
            <div className="bg-primary-container text-white rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-secondary/30">
              <div className="min-w-0">
                <span className="font-label-xs uppercase text-primary-fixed-dim block truncate">
                  {lang === 'fr' ? 'Alias Public Anonyme' : 'Public Order-Book Alias'}
                </span>
                <span className="font-headline-sm font-mono-num text-white">
                  {previewAlias}
                </span>
              </div>
              <span className="px-3 py-1 rounded-lg bg-black/40 text-on-tertiary-container font-label-xs uppercase self-start sm:self-center shrink-0">
                Privacy Protected
              </span>
            </div>

            <form onSubmit={handleSaveOnboarding} className="flex flex-col gap-5">
              <div className="flex flex-col gap-1.5">
                <label className="font-label-xs uppercase text-on-surface-variant">
                  {lang === 'fr' ? 'Nom Complet' : 'Your Name'}
                </label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Nadine Nguema"
                  className="w-full px-3.5 py-3 rounded-xl bg-surface-container-low border border-outline-variant/40 text-on-surface font-body-md outline-none focus:ring-2 focus:ring-secondary"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="font-label-xs uppercase text-on-surface-variant">
                  {lang === 'fr' ? 'Ville' : 'City'}
                </label>
                <div className="flex flex-wrap gap-2">
                  {CITIES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCity(c)}
                      className={`py-2 px-3 rounded-xl font-label-md text-[12px] transition-colors ${
                        city === c
                          ? 'bg-secondary text-on-secondary'
                          : 'bg-surface-container-low text-on-surface hover:bg-secondary-fixed'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="font-label-xs uppercase text-on-surface-variant">
                    {lang === 'fr' ? 'Numéro Mobile Money (+237)' : 'Mobile Money Line (+237)'}
                  </label>
                  <span className="inline-flex items-center gap-1.5 font-label-xs uppercase px-2 py-0.5 rounded bg-surface-container">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        detectedCarrier === 'MTN'
                          ? 'bg-[#fcd116]'
                          : detectedCarrier === 'ORANGE'
                          ? 'bg-[#ff7900]'
                          : 'bg-outline'
                      }`}
                    />
                    {detectedCarrier === 'MTN'
                      ? 'MTN MoMo'
                      : detectedCarrier === 'ORANGE'
                      ? 'Orange Money'
                      : 'Detecting...'}
                  </span>
                </div>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="237677821940"
                  className="w-full px-3.5 py-3 rounded-xl bg-surface-container-low border border-outline-variant/40 text-on-surface font-ticker-val tracking-wider outline-none focus:ring-2 focus:ring-secondary"
                />
                <span className="font-body-sm text-on-surface-variant">
                  Cameroon format 2376XXXXXXXX for deposits and streaming payouts.
                </span>
              </div>

              <div className="flex flex-col gap-2">
                <label className="font-label-xs uppercase text-on-surface-variant">
                  {lang === 'fr' ? 'Catégories Favorites' : 'What Are You Into?'}
                </label>
                <div className="flex flex-wrap gap-2">
                  {INTERESTS.map((tag) => {
                    const active = interests.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleInterest(tag)}
                        className={`px-3 py-1.5 rounded-lg font-label-md text-[12px] transition-colors ${
                          active
                            ? 'bg-secondary-fixed text-secondary ring-1 ring-secondary'
                            : 'bg-surface-container-low text-on-surface-variant hover:text-on-surface'
                        }`}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>

              {errorMsg && (
                <div className="p-3 rounded-xl bg-error-container text-on-error-container font-body-sm">
                  {errorMsg}
                </div>
              )}
              {infoMsg && (
                <div className="p-3 rounded-xl bg-secondary-fixed text-on-surface font-body-sm">
                  {infoMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={busy}
                className="w-full py-3.5 rounded-xl bg-on-tertiary-container text-white font-headline-sm text-[14px] sm:text-[15px] font-bold uppercase tracking-wider shadow-sm hover:opacity-95 transition-opacity disabled:opacity-60"
              >
                {busy
                  ? '...'
                  : lang === 'fr'
                  ? 'Enregistrer & Entrer'
                  : 'Save & Enter Crippo'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
