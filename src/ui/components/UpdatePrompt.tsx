import { APP_NAME, APP_VERSION } from '@/core/app';
import { useUpdates } from '@/ui/state/updatesState';

/** "Version x is available" with Download / Skip this version / Later. */
export function UpdatePrompt() {
  const { offer, download, skip, later } = useUpdates();
  if (!offer) {
    return null;
  }
  return (
    <section className="card update-prompt" role="dialog" aria-label="Update available">
      <p className="update-title">
        {APP_NAME} {offer.version} is available <span className="hint">(you have {APP_VERSION})</span>
      </p>
      <button className="button" onClick={download}>Download</button>
      <div className="update-actions">
        <button className="link-button" onClick={skip}>Skip this version</button>
        <button className="link-button" onClick={later}>Later</button>
      </div>
    </section>
  );
}
