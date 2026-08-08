import { useState } from 'react';
import type { ApiError } from '../lib/api';

interface ErrorBannerProps {
  error: ApiError;
  onDismiss?: () => void;
}

/** Structured error display with collapsible machine-readable details. */
export function ErrorBanner({ error, onDismiss }: ErrorBannerProps) {
  const [showDetails, setShowDetails] = useState(false);
  const hasDetails = error.details !== undefined;

  return (
    <div className="error-banner" role="alert">
      <div className="error-head">
        <span className="error-code">{error.code}</span>
        <span className="error-message">{error.message}</span>
        <span className="error-actions">
          {hasDetails ? (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setShowDetails((v) => !v)}
            >
              {showDetails ? 'Hide details' : 'Details'}
            </button>
          ) : null}
          {onDismiss ? (
            <button type="button" className="btn-ghost" onClick={onDismiss}>
              Dismiss
            </button>
          ) : null}
        </span>
      </div>
      {showDetails && hasDetails ? (
        <pre className="error-details">{JSON.stringify(error.details, null, 2)}</pre>
      ) : null}
    </div>
  );
}
