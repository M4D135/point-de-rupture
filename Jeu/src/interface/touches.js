// touches.js
// Registre des raccourcis clavier.

import { demarrerVisee, annulerVisee } from './ordres.js';
import { getReglages } from '../data/reglages.js';

const CONFLITS = ['A', 'F', 'H', 'R', 'G', 'L', 'C', 'B', 'X', 'E', 'V', 'J', 'Y', 'P', 'Z', 'Q', 'S', 'D'];

export function initTouches() {
    const reglages = getReglages();
    const toucheMolotov = (reglages.touches.ordreMolotov || 'M').toUpperCase();
    const toucheLacrymo = (reglages.touches.ordreLacrymo || 'T').toUpperCase();

    document.addEventListener('keydown', (e) => {
        const key = e.key.toUpperCase();

        if (key === 'ESCAPE') {
            annulerVisee();
            return;
        }

        if (key === toucheMolotov) {
            demarrerVisee('Molotov');
        } else if (key === toucheLacrymo) {
            demarrerVisee('Lacrymo');
        }
    });
}
