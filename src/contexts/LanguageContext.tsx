import React, { createContext, useContext, useState } from 'react';

export type Language = 'en' | 'fr';

const TRANSLATIONS: Record<Language, Record<string, string>> = {
  en: {
    brand: 'Crippo',
    tagline: 'Grow with the creators you love.',
    nav_markets: 'Markets',
    nav_trades: 'My Trades',
    nav_brands: 'Brands',
    nav_launch: 'Launch Race',
    nav_clearing: 'Clearing',
    nav_profile: 'Account',
    sign_in: 'Sign In',
    sign_out: 'Sign Out',
    api_setup: 'System Status',
    hero_kicker: 'AI-Underwritten Creator Exchange · Cameroon & Africa',
    hero_title: 'Own a verifiable revenue stake in African digital projects.',
    hero_sub: 'Buy and track revenue-sharing stakes in monitorable albums, films, and series via MTN MoMo & Orange Money in real XAF.',
    explore_races: 'Explore Open Races',
    sync_creators: 'Sync Real Creators',
    sync_pulse: 'Refresh Cultural Pulse',
    top_movers: 'Market Movers',
    open_races: 'Live Project Races',
    all_categories: 'All Categories',
    no_races_title: 'No live Races published yet',
    no_races_desc: 'Races appear automatically once verified creators pass the AI Underwriter check and publish a project.',
    launch_first_race: 'Launch a Race',
    cultural_feed: 'Unified Cultural Pulse',
    segment_all: 'All',
    segment_trending: 'Trending',
    segment_entertainment: 'Entertainment',
    segment_music: 'Music',
    segment_tech: 'Tech',
    segment_news: 'Local News',
    no_catalysts_title: 'No news updates yet',
    no_catalysts_desc: 'Trending stories and creator updates will appear here shortly.',
    share_price: 'Share Price',
    net_budget: 'Net Budget',
    gross_target: 'Gross Target (5% fee)',
    rev_share: 'Rev Share',
    roi_window: 'ROI Window',
    crippo_score: 'Crippo Score',
    funded: 'Funded',
    shares_left: 'Shares Left',
    buy_shares: 'Buy Shares',
    inspect_market: 'Inspect Market',
    time_remaining: 'Time Remaining',
    trades_title: 'My Trades & Active Timelines',
    trades_sub: 'Track every position you hold, live XAF valuation, and exact milestone countdowns from Race Close to Royalty Clearing.',
    total_invested: 'Total Capital Invested',
    current_value: 'Current Market Value',
    unrealized_pnl: 'Unrealized P&L',
    dividends_cleared: 'Dividends Cleared',
    active_positions: 'Active Positions',
    escrow_production: 'In Production / Escrow',
    royalty_clearing: 'Royalty Clearing',
    ledger_history: 'Order & MoMo Ledger',
    no_trades_title: 'You have no open trades yet',
    no_trades_desc: 'Enter any Open Race with MTN MoMo or Orange Money via CamPay to track your shares and timelines here.',
    auth_title: 'Unified Crippo Access',
    auth_sub: 'One single account to trade shares, track royalties, or enable Creator Market Mode whenever you are ready.',
    continue_google: 'Continue with Google',
    email_label: 'Email Address',
    password_label: 'Password',
    login_btn: 'Sign In with Email',
    signup_btn: 'Create Account',
    onboarding_title: 'Complete Your Trader Profile',
    onboarding_sub: 'Set up your Mobile Money wallet and receive a private Trader ID for anonymous order book execution.',
    full_name: 'Full Name',
    city_label: 'City',
    momo_phone: 'Primary Mobile Money Number (2376XXXXXXXX)',
    interests_label: 'Market Interests',
    save_continue: 'Save & Enter Exchange',
    creator_mode_banner: 'Are you a Creator, Talent Agency, or Brand? Enable Crippo Creator Market.',
    claim_profile: 'Claim Creator Profile',
    paid_memo: 'Submit Paid Memo Request',
    launch_title: 'Launch an AI-Underwritten Race',
    submit_underwrite: 'Submit for AI Underwriting',
    mtn_momo: 'MTN MoMo',
    orange_money: 'Orange Money',
    confirm_ussd: 'Send CamPay USSD Prompt',
    empty_entities: 'No creator entities synced yet',
    months_unit: 'mos',
  },
  fr: {
    brand: 'Crippo',
    tagline: 'Grandissez avec les créateurs que vous aimez.',
    nav_markets: 'Marchés',
    nav_trades: 'Mes Trades',
    nav_brands: 'Marques',
    nav_launch: 'Lancer une Race',
    nav_clearing: 'Compensation',
    nav_profile: 'Compte',
    sign_in: 'Connexion',
    sign_out: 'Déconnexion',
    api_setup: 'Statut',
    hero_kicker: 'Bourse Créative Audité par IA · Cameroun & Afrique',
    hero_title: 'Investissez dans les revenus réels des créateurs africains.',
    hero_sub: 'Achetez et suivez des parts de revenus sur des albums, films et séries vérifiables via MTN MoMo & Orange Money en FCFA (XAF).',
    explore_races: 'Explorer les Races',
    sync_creators: 'Synchroniser Créateurs',
    sync_pulse: 'Actualiser le Pouls Culturel',
    top_movers: 'Variations du Marché',
    open_races: 'Races en Cours',
    all_categories: 'Toutes Catégories',
    no_races_title: 'Aucune Race ouverte pour le moment',
    no_races_desc: 'Les projets apparaissent dès qu’un créateur vérifié valide l’audit légal et l’agent de souscription IA.',
    launch_first_race: 'Lancer une Race',
    cultural_feed: 'Pouls Culturel Unifié',
    segment_all: 'Tout',
    segment_trending: 'Tendances',
    segment_entertainment: 'Divertissement',
    segment_music: 'Musique',
    segment_tech: 'Tech',
    segment_news: 'Actu Locale',
    no_catalysts_title: 'Aucune actualité disponible',
    no_catalysts_desc: 'Les actualités tendance et mises à jour des créateurs apparaîtront ici.',
    share_price: 'Prix de la Part',
    net_budget: 'Budget Net',
    gross_target: 'Objectif Brut (+5%)',
    rev_share: 'Part Revenus',
    roi_window: 'Durée ROI',
    crippo_score: 'Score Crippo',
    funded: 'Financé',
    shares_left: 'Parts Dispo',
    buy_shares: 'Acheter des Parts',
    inspect_market: 'Analyser le Marché',
    time_remaining: 'Temps Restant',
    trades_title: 'Mes Trades & Échéanciers en Cours',
    trades_sub: 'Suivez chaque position détenue, sa valorisation en XAF et le décompte exact de la clôture jusqu’au versement des royalties.',
    total_invested: 'Capital Total Investi',
    current_value: 'Valeur Actuelle',
    unrealized_pnl: 'Gain / Perte Latent',
    dividends_cleared: 'Dividendes Versés',
    active_positions: 'Positions Actives',
    escrow_production: 'En Production / Séquestre',
    royalty_clearing: 'Compensation Royalties',
    ledger_history: 'Historique & MoMo',
    no_trades_title: 'Aucun trade actif pour le moment',
    no_trades_desc: 'Participez à une Race ouverte via MTN MoMo ou Orange Money sur CamPay pour suivre vos parts et délais ici.',
    auth_title: 'Accès Unifié Crippo',
    auth_sub: 'Un seul compte pour trader des parts, suivre vos royalties ou activer le Mode Créateur à tout moment.',
    continue_google: 'Continuer avec Google',
    email_label: 'Adresse Email',
    password_label: 'Mot de passe',
    login_btn: 'Connexion par Email',
    signup_btn: 'Créer un Compte',
    onboarding_title: 'Finalisez Votre Profil Trader',
    onboarding_sub: 'Configurez votre numéro Mobile Money et recevez un identifiant anonyme pour le carnet d’ordres.',
    full_name: 'Nom Complet',
    city_label: 'Ville',
    momo_phone: 'Numéro Mobile Money Principal (2376XXXXXXXX)',
    interests_label: 'Centres d’intérêt',
    save_continue: 'Enregistrer & Accéder au Marché',
    creator_mode_banner: 'Vous êtes Créateur, Label ou Agence ? Activez le Marché Créateur Crippo.',
    claim_profile: 'Revendiquer un Profil',
    paid_memo: 'Demande de Listing Payante',
    launch_title: 'Lancer une Race Auditée par IA',
    submit_underwrite: 'Soumettre à l’Audit IA',
    mtn_momo: 'MTN MoMo',
    orange_money: 'Orange Money',
    confirm_ussd: 'Envoyer le Prompt USSD CamPay',
    empty_entities: 'Aucun créateur synchronisé',
    months_unit: 'mois',
  },
};

interface LanguageContextValue {
  lang: Language;
  setLang: (l: Language) => void;
  toggleLang: () => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Language>(() => {
    const saved = localStorage.getItem('crippo_lang');
    return saved === 'fr' ? 'fr' : 'en';
  });

  const setLang = (l: Language) => {
    setLangState(l);
    localStorage.setItem('crippo_lang', l);
  };

  const toggleLang = () => setLang(lang === 'en' ? 'fr' : 'en');
  const t = (key: string) => TRANSLATIONS[lang][key] || TRANSLATIONS.en[key] || key;

  return (
    <LanguageContext.Provider value={{ lang, setLang, toggleLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used inside LanguageProvider');
  return ctx;
}
