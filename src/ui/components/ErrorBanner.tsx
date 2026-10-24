export function ErrorBanner({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <div className="banner banner-error" role="alert">
      <span>{error.message}</span>
      {onRetry && <button className="link-button" onClick={onRetry}>Retry</button>}
    </div>
  );
}
