import { useEffect, useState } from 'react';
import { STRINGS, type Lang } from './i18n';

interface NotificationSettings {
  webhookEnabled: boolean;
  webhookUrl: string;
  webhookFormat: 'slack' | 'generic';
}

interface NotificationItem {
  id: string;
  kind: 'publish_request' | 'publish_completed' | 'duplicate_warning';
  title: string;
  body: string;
  link: string | null;
  createdAt: string;
  delivered: { webhook: 'ok' | 'skip' | 'error'; webhookError?: string };
}

interface Props {
  lang: Lang;
  onClose: () => void;
}

export function NotificationsPanel({ lang, onClose }: Props) {
  const t = STRINGS[lang];
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  async function reload() {
    const [s, n] = await Promise.all([
      fetch('/api/notifications/settings').then((r) => r.json()),
      fetch('/api/notifications').then((r) => r.json()),
    ]);
    setSettings(s);
    setItems(n);
  }

  useEffect(() => {
    void reload();
  }, []);

  async function save() {
    if (!settings) return;
    setBusy(true);
    try {
      await fetch('/api/notifications/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      setFlash(t.notif.saved);
      setTimeout(() => setFlash(null), 1500);
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    try {
      await fetch('/api/notifications/test', { method: 'POST' });
      setFlash(t.notif.tested);
      setTimeout(() => setFlash(null), 1500);
      await reload();
    } finally {
      setBusy(false);
    }
  }

  function kindLabel(k: NotificationItem['kind']) {
    if (k === 'publish_request') return t.notif.kindRequest;
    if (k === 'publish_completed') return t.notif.kindCompleted;
    return t.notif.kindDup;
  }

  function deliveryBadge(d: NotificationItem['delivered']) {
    if (d.webhook === 'ok') return <span className="badge ok">{t.notif.delivered}</span>;
    if (d.webhook === 'skip') return <span className="badge skip">{t.notif.skipped}</span>;
    return (
      <span className="badge err" title={d.webhookError ?? ''}>
        {t.notif.errored}
      </span>
    );
  }

  if (!settings) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>{t.notif.title}</h2>
          <button onClick={onClose} type="button" className="x-btn">
            ×
          </button>
        </header>

        <section className="settings-block">
          <label className="form-row check">
            <input
              type="checkbox"
              checked={settings.webhookEnabled}
              onChange={(e) =>
                setSettings({ ...settings, webhookEnabled: e.target.checked })
              }
            />
            <span>{t.notif.enable}</span>
          </label>
          <label className="form-row">
            <span>{t.notif.url}</span>
            <input
              value={settings.webhookUrl}
              onChange={(e) => setSettings({ ...settings, webhookUrl: e.target.value })}
              placeholder="https://hooks.slack.com/services/T0/B0/xxx"
            />
            <small className="hint">{t.notif.urlHint}</small>
          </label>
          <label className="form-row">
            <span>{t.notif.format}</span>
            <select
              value={settings.webhookFormat}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  webhookFormat: e.target.value as 'slack' | 'generic',
                })
              }
            >
              <option value="slack">{t.notif.formatSlack}</option>
              <option value="generic">{t.notif.formatGeneric}</option>
            </select>
          </label>
          <div className="modal-actions">
            <button type="button" onClick={sendTest} disabled={busy} className="secondary">
              {t.notif.sendTest}
            </button>
            <button type="button" onClick={save} disabled={busy}>
              {t.notif.save}
            </button>
            {flash && <span className="status-flash">{flash}</span>}
          </div>
        </section>

        <section className="inbox-block">
          <h3>{t.notif.inbox}</h3>
          {items.length === 0 ? (
            <p className="muted small">{t.notif.empty}</p>
          ) : (
            <ul className="inbox">
              {items.map((n) => (
                <li key={n.id} className={`inbox-item kind-${n.kind}`}>
                  <div className="inbox-row1">
                    <span className="kind-tag">{kindLabel(n.kind)}</span>
                    <span className="inbox-time muted small">
                      {new Date(n.createdAt).toLocaleString(lang === 'ko' ? 'ko-KR' : 'en-US')}
                    </span>
                    {deliveryBadge(n.delivered)}
                  </div>
                  <div className="inbox-title">{n.title}</div>
                  <pre className="inbox-body">{n.body}</pre>
                  {n.link && (
                    <a className="inbox-link" href={n.link} target="_blank" rel="noreferrer">
                      {n.link}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
