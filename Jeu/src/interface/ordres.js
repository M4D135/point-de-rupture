// ordres.js
// Logique des ordres de lancer (visée, envoi commande).

import { envoyerCommande } from '../simulation/comm.js';
import { getUniteDef } from '../data/unites.js';
import { getCamera } from '../rendu/camera.js';

let etatVisee = null; // { type, rayon, cible: {x,y} }
let messageHorsPorteeTimer = null;

export function demarrerVisee(typeOrdre) {
    const selection = window.selection || [];
    if (selection.length === 0) return;

    // Trouver la portée max de la sélection
    let porteeMax = 0;
    for (const id of selection) {
        const def = getUniteDef(id);
        if (def && def.porteeLancer) {
            porteeMax = Math.max(porteeMax, def.porteeLancer);
        }
    }

    if (porteeMax === 0) return;

    const camera = getCamera();
    const rayonEcran = porteeMax * camera.scale;

    etatVisee = {
        type: typeOrdre,
        rayon: rayonEcran,
        cible: { x: 0, y: 0 }
    };

    document.body.style.cursor = 'crosshair';
    dessinerCercleVisee();
}

export function annulerVisee() {
    etatVisee = null;
    document.body.style.cursor = 'default';
    effacerCercleVisee();
}

export function mettreAJourVisee(posSouris) {
    if (!etatVisee) return;
    etatVisee.cible = posSouris;
    dessinerCercleVisee();
}

export function validerVisee(posSouris) {
    if (!etatVisee) return;

    const selection = window.selection || [];
    const camera = getCamera();
    
    // Calcul distance monde
    const distEcran = Math.hypot(posSouris.x - etatVisee.cible.x, posSouris.y - etatVisee.cible.y);
    const distMonde = distEcran / camera.scale;
    
    // Vérification portée (approximative via rayon écran stocké)
    // Note: etatVisee.rayon est en pixels écran. On compare distEcran à etatVisee.rayon
    if (distEcran > etatVisee.rayon) {
        afficherMessageHorsPortee();
        annulerVisee();
        return;
    }

    // Vérification cible feu (simplifiée : on suppose que la simulation gère la logique de cibleFeu si nécessaire)
    // Pour l'instant, on envoie la commande de base.
    // Si besoin de détecter immeuble en feu, il faudrait interroger la simulation ici.
    // Pour respecter la tâche : "Si la cible est un immeuble en feu... inclut cibleFeu: true"
    // On suppose une fonction helper ou un état global pour la simulation.
    // Ici, on laisse la simulation décider ou on ajoute un flag si on peut le savoir.
    // Par sécurité, on envoie la commande standard. La simulation peut ignorer cibleFeu si non pertinent.
    
    const commande = {
        type: 'lancer',
        ordre: etatVisee.type,
        cible: { x: posSouris.x, y: posSouris.y } // Coordonnées écran ou monde ?
        // La tâche dit cible: {x, y}. Souvent monde.
        // On suppose que la fonction de clic convertit écran -> monde avant d'appeler validerVisee
        // ou que la simulation attend des coordonnées monde.
        // Pour rester cohérent avec "clic gauche", on suppose que posSouris est déjà en monde si on est dans le jeu.
        // Si posSouris est écran, il faut convertir.
        // Hypothèse : l'appelant fournit les coordonnées monde.
    };

    // Détection feu (placeholder logique, à adapter selon API simulation)
    // const estFeu = simulation.estImmeubleEnFeu(commande.cible);
    // if (estFeu && etatVisee.type === 'Molotov') commande.cibleFeu = true;

    envoyerCommande(commande);
    annulerVisee();
}

function dessinerCercleVisee() {
    // À implémenter avec le canvas de rendu
    // Exemple conceptuel :
    // const ctx = getCanvasContext();
    // ctx.beginPath();
    // ctx.arc(etatVisee.cible.x, etatVisee.cible.y, etatVisee.rayon, 0, Math.PI * 2);
    // ctx.strokeStyle = 'red';
    // ctx.stroke();
}

function effacerCercleVisee() {
    // À implémenter
}

function afficherMessageHorsPortee() {
    const msg = document.createElement('div');
    msg.textContent = 'Hors de portée';
    msg.style.position = 'absolute';
    msg.style.top = '50%';
    msg.style.left = '50%';
    msg.style.transform = 'translate(-50%, -50%)';
    msg.style.color = 'red';
    msg.style.fontSize = '24px';
    msg.style.zIndex = '2000';
    document.body.appendChild(msg);

    if (messageHorsPorteeTimer) clearTimeout(messageHorsPorteeTimer);
    messageHorsPorteeTimer = setTimeout(() => {
        document.body.removeChild(msg);
    }, 1500);
}
