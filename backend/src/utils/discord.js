/**
 * Discord Webhook Notifications
 * Wysyla powiadomienia na Discord przez webhooki.
 * Uzywa natywnego fetch (Node 18+).
 *
 * Konfiguracja: ustaw DISCORD_WEBHOOK_URL w .env
 * Jesli URL nie jest skonfigurowany, funkcje po cichu nic nie robia.
 *
 * Usage:
 *   import { notifyNewUser, notifyBan, notifyServerStart } from '../utils/discord.js';
 *   notifyNewUser('Steve');
 */
import { createLogger } from './logger.js';

const log = createLogger('Discord');

/**
 * Pobiera URL webhooka z env
 * @returns {string|null}
 */
function getWebhookUrl() {
    return process.env.DISCORD_WEBHOOK_URL || null;
}

/**
 * Wysyla wiadomosc do Discord przez webhook
 * @param {string} url - URL webhooka Discord
 * @param {object} embed - Obiekt embed Discord
 * @returns {Promise<boolean>} true jesli wyslano pomyslnie
 */
export async function sendWebhook(url, embed) {
    if (!url) return false;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                embeds: [embed]
            })
        });

        if (!response.ok) {
            log.warn('Discord webhook failed', {
                status: response.status,
                statusText: response.statusText
            });
            return false;
        }

        log.debug('Discord webhook sent', { title: embed.title });
        return true;
    } catch (error) {
        log.warn('Discord webhook error', { error: error.message });
        return false;
    }
}

/**
 * Powiadomienie o nowym uzytkowniku
 * @param {string} username - Nazwa nowego gracza
 */
export async function notifyNewUser(username) {
    const url = getWebhookUrl();
    if (!url) return;

    await sendWebhook(url, {
        title: 'Nowy gracz!',
        description: `**${username}** zarejestrował się na serwerze.`,
        color: 0x00cc66, // zielony
        timestamp: new Date().toISOString(),
        footer: { text: 'XsusLauncher' }
    });
}

/**
 * Powiadomienie o banie
 * @param {string} username - Nazwa zbanowanego gracza
 * @param {string} reason - Powod bana
 */
export async function notifyBan(username, reason) {
    const url = getWebhookUrl();
    if (!url) return;

    await sendWebhook(url, {
        title: 'Gracz zbanowany',
        description: `**${username}** został zbanowany.`,
        color: 0xff4444, // czerwony
        fields: [
            {
                name: 'Powód',
                value: reason || 'Nie podano',
                inline: false
            }
        ],
        timestamp: new Date().toISOString(),
        footer: { text: 'XsusLauncher' }
    });
}

/**
 * Powiadomienie o starcie serwera
 */
export async function notifyServerStart() {
    const url = getWebhookUrl();
    if (!url) return;

    await sendWebhook(url, {
        title: 'Serwer uruchomiony',
        description: 'API serwera XsusLauncher zostało uruchomione.',
        color: 0x3399ff, // niebieski
        timestamp: new Date().toISOString(),
        footer: { text: 'XsusLauncher' }
    });
}

/**
 * Powiadomienie o maintenance
 * @param {string} message - Wiadomosc maintenance
 */
export async function notifyMaintenance(message) {
    const url = getWebhookUrl();
    if (!url) return;

    await sendWebhook(url, {
        title: 'Przerwa techniczna',
        description: message || 'Serwer przechodzi przerwę techniczną.',
        color: 0xffaa00, // zolty
        timestamp: new Date().toISOString(),
        footer: { text: 'XsusLauncher' }
    });
}

export default {
    sendWebhook,
    notifyNewUser,
    notifyBan,
    notifyServerStart,
    notifyMaintenance
};
