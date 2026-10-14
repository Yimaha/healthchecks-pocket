import { useState, type ChangeEvent, type ReactNode } from 'react';
import type { HealthchecksApi } from '../core/api';
import { computeIconAssignmentKey, PRESETS, presetRef, type IconRef } from '../core/icons';
import type { Account } from '../core/types';
import { CheckIcon } from './CheckIcon';
import { useIcons } from './checkIcons';
import { ErrorBanner, Header } from './common';
import { useAsync } from './hooks';
import { IconCropper } from './IconCropper';
import { cropToDataUrl, decodeImage, type DecodedImage } from './imageTools';
import { href } from './routes';

const ACCEPTED_FILES = 'image/*,.heic,.heif,.ico,.svg,.bmp,.avif,.webp';

/** Choose a check's icon: a preset, one of your uploads, or a new upload
 *  (cropped to a square). Icons other checks use are marked, but can still
 *  be picked. */
export function IconPicker({ api, account, id }: { api: HealthchecksApi; account: Account; id: string }) {
  const check = useAsync(() => api.getCheck(id), [api, id]);
  const icons = useIcons();
  const iconAssignmentKey = computeIconAssignmentKey(account.id, id);
  const currentIcon = icons.savedIconsByCheck[iconAssignmentKey] ?? (check.data && icons.iconForCheck(account.id, check.data));
  const [image, setImage] = useState<DecodedImage>();
  const [error, setError] = useState<Error>();

  // Icons of the project's other live checks (as of its latest list).
  const usedByOthers = icons.iconsUsedByOtherChecks(account.id, iconAssignmentKey);
  const choose = (iconRef: IconRef) => {
    icons.assign(iconAssignmentKey, iconRef);
    history.back();
  };

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ''; // choosing the same file again still works
    if (!file) return;
    setError(undefined);
    try {
      setImage(await decodeImage(file));
    } catch (decodeError) {
      setError(decodeError as Error);
    }
  }

  const choice = (iconRef: IconRef, label: string, extra?: ReactNode) => (
    <div key={iconRef} className="icon-choice">
      <button
        type="button"
        className={`icon-choice-button${iconRef === currentIcon ? ' current' : ''}`}
        aria-label={label + (usedByOthers.has(iconRef) ? ' (in use)' : '')}
        aria-pressed={iconRef === currentIcon}
        onClick={() => choose(iconRef)}
      >
        <CheckIcon iconRef={iconRef} size="md" />
        {usedByOthers.has(iconRef) && <span className="icon-in-use" aria-hidden="true" />}
      </button>
      {extra}
    </div>
  );

  return (
    <>
      <Header title="Icon" back={href({ name: 'check', id })} />
      <main className="page">
        {check.error && <ErrorBanner error={check.error} onRetry={check.reload} />}
        <section className="card icon-current">
          <CheckIcon iconRef={currentIcon} size="lg" />
          <span className="check-name">{check.data?.name || check.data?.slug || 'Check'}</span>
        </section>

        {image ? (
          <IconCropper
            image={image}
            onCancel={() => setImage(undefined)}
            onSave={(box) => choose(`custom:${icons.addUpload(cropToDataUrl(image, box))}`)}
          />
        ) : (
          <>
            <h2 className="section-title">Your icons</h2>
            {error && <ErrorBanner error={error} />}
            <div className="icon-grid">
              {Object.keys(icons.uploads).map((uploadId) => choice(`custom:${uploadId}`, 'Your icon', (
                <button
                  type="button"
                  className="icon-delete"
                  aria-label="Delete this icon"
                  onClick={() => {
                    if (confirm('Delete this icon? Checks using it go back to their default icon.')) icons.removeUpload(uploadId);
                  }}
                >
                  ×
                </button>
              )))}
              <label className="icon-upload">
                <input type="file" accept={ACCEPTED_FILES} onChange={upload} aria-label="Upload an image" />
                <span aria-hidden="true">+</span>
                <span className="icon-upload-text">Upload</span>
              </label>
            </div>
            <p className="hint-text">PNG, JPEG, WebP, GIF, BMP, AVIF, SVG or ICO. You crop it to a square next.</p>

            <h2 className="section-title">Icons</h2>
            <div className="icon-grid">
              {PRESETS.map((preset) => choice(presetRef(preset.id), preset.label))}
            </div>
            <p className="hint-text">A dot marks icons other checks in this project use; you can still pick them.</p>
          </>
        )}
      </main>
    </>
  );
}
