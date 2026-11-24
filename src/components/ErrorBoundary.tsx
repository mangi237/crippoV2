import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || 'An unexpected error occurred.',
    };
  }

  render() {
    if (this.state.hasError) {
      let friendly = 'Something went wrong while loading this view.';
      try {
        const parsed = JSON.parse(this.state.message);
        if (parsed?.error) {
          friendly = parsed.error;
        }
      } catch {
        if (this.state.message) friendly = this.state.message;
      }

      return (
        <div className="min-h-screen bg-surface text-on-surface flex items-center justify-center p-6">
          <div className="max-w-lg w-full py-8 border-t border-b border-outline-variant/30 flex flex-col items-start gap-4">
            <h1 className="font-display text-xl font-bold text-on-surface">
              Unable to complete request
            </h1>
            <p className="text-sm text-on-surface-variant break-words">
              {friendly}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-secondary text-on-secondary text-sm font-semibold rounded-xl transition-opacity hover:opacity-95"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
