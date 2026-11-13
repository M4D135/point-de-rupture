// carte-ordres.js
// Carte contextuelle des ordres de lancer selon la sélection.

import { getUniteDef } from '../data/unites.js';

const ETAT = {
    selection: [],
    carteVisible: false,
    position: { x: 0, y: 0 }
};

const ELEMENTS_DOM = {
    conteneur: null,
    entreeMolotov: null,
    entreeLacrymo: null
};

export function initCarteOrdres() {
    const conteneur = document.createElement('div');
    conteneur.id = 'carte-ordres';
    conteneur.style.display = 'none';
    conteneur.style.position = 'absolute';
    conteneur.style.background = 'rgba(0,0,0,0.8)';
    conteneur.style.border = '1px solid #444';
    conteneur.style.padding = '5px';
    conteneur.style.zIndex = '1000';
    document.body.appendChild(conteneur);
    ELEMENTS_DOM.conteneur = conteneur;

    const entreeMolotov = document.createElement('div');
    entreeMolotov.className = 'ordre-entree';
    entreeMolotov.textContent = 'Molotov (M)';
    entreeMolotov.style.cursor = 'pointer';
    entreeMolotov.addEventListener('click', () => {
        if (!entreeMolotov.classList.contains('grisee')) {
            import('./ordres.js').then(m => m.demarrerVisee('Molotov'));
        }
    });
    conteneur.appendChild(entreeMolotov);
    ELEMENTS_DOM.entreeMolotov = entreeMolotov;

    const entreeLacrymo = document.createElement('div');
    entreeLacrymo.className = 'ordre-entree';
    entreeLacrymo.textContent = 'Lacrymogène (T)';
    entreeLacrymo.style.cursor = 'pointer';
    entreeLacrymo.addEventListener('click', () => {
        if (!entreeLacrymo.classList.contains('grisee')) {
            import('./ordres.js').then(m => m.demarrerVisee('Lacrymo'));
        }
    });
    conteneur.appendChild(entreeLacrymo);
    ELEMENTS_DOM.entreeLacrymo = entreeLacrymo;
}

export function mettreAJourCarteOrdres(selection, posSouris) {
    if (!selection || selection.length === 0) {
        ELEMENTS_DOM.conteneur.style.display = 'none';
        return;
    }

    let aConvergence = false;
    let aPrefecture = false;

    for (const id of selection) {
        const def = getUniteDef(id);
        if (def && def.type === 11) aConvergence = true;
        if (def && def.type === 12) aPrefecture = true;
    }

    ELEMENTS_DOM.conteneur.style.display = 'block';
    ELEMENTS_DOM.conteneur.style.left = posSouris.x + 'px';
    ELEMENTS_DOM.conteneur.style.top = posSouris.y + 'px';

    const entreeM = ELEMENTS_DOM.entreeMolotov;
    const entreeL = ELEMENTS_DOM.entreeLacrymo;

    // Réinitialisation
    entreeM.classList.remove('grisee');
    entreeL.classList.remove('grisee');
    entreeM.title = '';
    entreeL.title = '';

    // Gestion Molotov
    if (aConvergence) {
        const def = getUniteDef(selection.find(id => getUniteDef(id)?.type === 11));
        const portee = def.porteeLancer || 0;
        entreeM.textContent = `Molotov (M) - ${portee}m`;
    } else {
        entreeM.classList.add('grisee');
        entreeM.title = 'Cette unité ne peut pas lancer de cocktail';
        entreeM.textContent = 'Molotov (M)';
    }

    // Gestion Lacrymogène
    if (aPrefecture) {
        const def = getUniteDef(selection.find(id => getUniteDef(id)?.type === 12));
        const portee = def.porteeLancer || 0;
        entreeL.textContent = `Lacrymogène (T) - ${portee}m`;
    } else {
        entreeL.classList.add('grisee');
        entreeL.title = 'Cette unité ne peut pas lancer de lacrymogène';
        entreeL.textContent = 'Lacrymogène (T)';
    }
}
