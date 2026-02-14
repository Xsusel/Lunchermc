/**
 * Simple Math CAPTCHA
 * Generuje proste wyzwania matematyczne bez potrzeby uslug zewnetrznych.
 *
 * Wyzwania sa przechowywane w pamieci z TTL 5 minut.
 *
 * Usage:
 *   import { generateChallenge, verifyChallenge } from '../utils/captcha.js';
 *
 *   // Generowanie
 *   const challenge = generateChallenge();
 *   // -> { id: 'abc123', question: '4 + 7 = ?' }
 *
 *   // Weryfikacja
 *   const valid = verifyChallenge('abc123', 11);
 *   // -> true/false
 */
import crypto from 'crypto';
import { createLogger } from './logger.js';

const log = createLogger('Captcha');

// In-memory store for captcha challenges
const challenges = new Map();

// TTL: 5 minut
const CAPTCHA_TTL = 5 * 60 * 1000;

// Czyszczenie wygaslych wyzwan co minute
setInterval(() => {
    const now = Date.now();
    for (const [id, challenge] of challenges.entries()) {
        if (now > challenge.expiresAt) {
            challenges.delete(id);
        }
    }
}, 60 * 1000);

/**
 * Generuje losowy ID
 * @returns {string}
 */
function generateId() {
    return crypto.randomBytes(16).toString('hex');
}

/**
 * Generuje wyzwanie matematyczne
 * @returns {{ id: string, question: string }}
 */
export function generateChallenge() {
    const operations = ['+', '-', '*'];
    const operation = operations[Math.floor(Math.random() * operations.length)];

    let a, b, answer;

    switch (operation) {
        case '+':
            a = Math.floor(Math.random() * 50) + 1;
            b = Math.floor(Math.random() * 50) + 1;
            answer = a + b;
            break;
        case '-':
            a = Math.floor(Math.random() * 50) + 10;
            b = Math.floor(Math.random() * a); // wynik >= 0
            answer = a - b;
            break;
        case '*':
            a = Math.floor(Math.random() * 10) + 1;
            b = Math.floor(Math.random() * 10) + 1;
            answer = a * b;
            break;
    }

    const id = generateId();
    const question = `${a} ${operation} ${b} = ?`;

    challenges.set(id, {
        answer,
        expiresAt: Date.now() + CAPTCHA_TTL,
        attempts: 0
    });

    log.debug('CAPTCHA generated', { id, question });

    return { id, question };
}

/**
 * Weryfikuje odpowiedz na wyzwanie
 * @param {string} id - ID wyzwania
 * @param {number|string} userAnswer - Odpowiedz uzytkownika
 * @returns {boolean} Czy odpowiedz jest poprawna
 */
export function verifyChallenge(id, userAnswer) {
    const challenge = challenges.get(id);

    if (!challenge) {
        log.debug('CAPTCHA not found or expired', { id });
        return false;
    }

    // Sprawdz TTL
    if (Date.now() > challenge.expiresAt) {
        challenges.delete(id);
        log.debug('CAPTCHA expired', { id });
        return false;
    }

    // Limit prob (max 3)
    challenge.attempts++;
    if (challenge.attempts > 3) {
        challenges.delete(id);
        log.debug('CAPTCHA max attempts exceeded', { id });
        return false;
    }

    const numericAnswer = parseInt(String(userAnswer), 10);

    if (isNaN(numericAnswer)) {
        return false;
    }

    const isCorrect = numericAnswer === challenge.answer;

    // Usun po poprawnej odpowiedzi (jednorazowe uzycie)
    if (isCorrect) {
        challenges.delete(id);
        log.debug('CAPTCHA verified successfully', { id });
    }

    return isCorrect;
}

/**
 * Pobiera liczbe aktywnych wyzwan (dla diagnostyki)
 * @returns {number}
 */
export function getActiveChallengesCount() {
    return challenges.size;
}

export default {
    generateChallenge,
    verifyChallenge,
    getActiveChallengesCount
};
