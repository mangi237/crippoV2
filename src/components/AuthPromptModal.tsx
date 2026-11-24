import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CrippoLogo } from './CrippoLogo';

interface AuthPromptModalProps {
  actionLabel?: string;
  onClose: () => void;
}

export function AuthPromptModal({ actionLabel, onClose }: AuthPromptModalProps) {
  const location = useLocation();
  const returnTo = encodeURIComponent(location.pathname + location.search);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md bg-surface text-on-surface border border-outline-variant/40 rounded-xl p-6 sm:p-8 flex flex-col gap-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <CrippoLogo size={36} />
            <div>
              <h3 className="font-headline-sm text-on-surface font-bold">
                Sign in to continue
              </h3>
              <p className="font-body-sm text-on-surface-variant">
                Grow with the creators you love.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-lg hover:bg-surface-container flex items-center justify-center text-on-surface-variant"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        <p className="font-body-md text-on-surface-variant leading-relaxed">
          {actionLabel
            ? `Create a free Crippo account or sign in to ${actionLabel}.`
            : 'Create a free Crippo account or sign in to buy shares, trade, vote on predictions, and receive MTN MoMo or Orange Money payouts.'}
        </p>

        <div className="flex flex-col gap-2.5 pt-1">
          <Link
            to={`/auth?skipSplash=1&mode=login&returnTo=${returnTo}`}
            onClick={onClose}
            className="w-full py-3 rounded-xl bg-secondary text-on-secondary font-label-md font-bold text-center hover:opacity-95 transition-opacity"
          >
            Sign In
          </Link>
          <Link
            to={`/auth?skipSplash=1&mode=signup&returnTo=${returnTo}`}
            onClick={onClose}
            className="w-full py-3 rounded-xl bg-primary-container text-white font-label-md font-bold text-center hover:opacity-95 transition-opacity"
          >
            Create Account
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 text-on-surface-variant font-label-md hover:text-on-surface transition-colors"
          >
            Continue Browsing as Guest
          </button>
        </div>
      </div>
    </div>
  );
}
