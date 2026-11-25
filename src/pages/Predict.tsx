import React, { useState } from 'react';
import { PredictionsSection } from '../components/PredictionsSection';
import { NewsSection } from '../components/NewsSection';
import { AuthPromptModal } from '../components/AuthPromptModal';

interface PredictProps {
  onOpenApiSetup: () => void;
}

export function Predict({ onOpenApiSetup }: PredictProps) {
  const [authPromptAction, setAuthPromptAction] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-10">
      <PredictionsSection
        onOpenApiSetup={onOpenApiSetup}
        onRequireAuth={(actionLabel) => setAuthPromptAction(actionLabel)}
      />

      <div className="border-t border-outline-variant/25 pt-8">
        <NewsSection
          onOpenApiSetup={onOpenApiSetup}
          onRequireAuth={(actionLabel) => setAuthPromptAction(actionLabel)}
        />
      </div>

      {authPromptAction && (
        <AuthPromptModal
          actionLabel={authPromptAction}
          onClose={() => setAuthPromptAction(null)}
        />
      )}
    </div>
  );
}
