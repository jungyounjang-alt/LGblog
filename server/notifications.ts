import axios from 'axios';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '..', 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'notification_settings.json');
const LOG_FILE = path.join(DATA_DIR, 'notification_log.json');

export type NotificationKind = 'publish_request' | 'publish_completed' | 'duplicate_warning';

export interface Notification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  link: string | null;
  createdAt: string;
  delivered: { webhook: 'ok' | 'skip' | 'error'; webhookError?: string };
}

export interface NotificationSettings {
  webhookEnabled: boolean;
  webhookUrl: string;
  webhookFormat: 'slack' | 'generic';
}

const DEFAULT_SETTINGS: NotificationSettings = {
  webhookEnabled: false,
  webhookUrl: '',
  webhookFormat: 'slack',
};

export async function getSettings(): Promise<NotificationSettings> {
  try {
    const raw = await fs.readFile(SETTINGS_FILE, 'utf8');
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(patch: Partial<NotificationSettings>): Promise<NotificationSettings> {
  const cur = await getSettings();
  const next = { ...cur, ...patch };
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(next, null, 2));
  return next;
}

async function readLog(): Promise<Notification[]> {
  try {
    const raw = await fs.readFile(LOG_FILE, 'utf8');
    const j = JSON.parse(raw) as { items: Notification[] };
    return j.items ?? [];
  } catch {
    return [];
  }
}

async function writeLog(items: Notification[]): Promise<void> {
  await fs.writeFile(LOG_FILE, JSON.stringify({ items }, null, 2));
}

export async function getRecentNotifications(limit = 50): Promise<Notification[]> {
  const items = await readLog();
  return items.slice(-limit).reverse();
}

async function postWebhook(
  settings: NotificationSettings,
  notif: Omit<Notification, 'id' | 'createdAt' | 'delivered'>,
): Promise<{ status: 'ok' | 'skip' | 'error'; error?: string }> {
  if (!settings.webhookEnabled || !settings.webhookUrl) return { status: 'skip' };
  try {
    const payload =
      settings.webhookFormat === 'slack'
        ? {
            text: `*${notif.title}*\n${notif.body}${notif.link ? `\n<${notif.link}|열기>` : ''}`,
          }
        : { ...notif };
    await axios.post(settings.webhookUrl, payload, { timeout: 10000 });
    return { status: 'ok' };
  } catch (err) {
    return { status: 'error', error: (err as Error).message };
  }
}

export async function emit(
  notif: Omit<Notification, 'id' | 'createdAt' | 'delivered'>,
): Promise<Notification> {
  const settings = await getSettings();
  const delivery = await postWebhook(settings, notif);
  const full: Notification = {
    ...notif,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    delivered: {
      webhook: delivery.status,
      ...(delivery.error ? { webhookError: delivery.error } : {}),
    },
  };
  const items = await readLog();
  items.push(full);
  // Keep last 500
  if (items.length > 500) items.splice(0, items.length - 500);
  await writeLog(items);
  return full;
}
