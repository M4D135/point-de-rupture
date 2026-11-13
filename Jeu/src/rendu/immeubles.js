// Import des fonctions de feu
import { dessinerFlammeFenetre, dessinerBraises, dessinerColonneFumee, dessinerFiletFumeeBlanche } from './feu.js';
import { estVisible } from './brouillard.js';

/**
 * Dessine les effets de feu, fumée et suie sur un immeuble.
 * @param {CanvasRenderingContext2D} ctx 
 * @param {Object} immeuble 
 * @param {Object} cam 
 */
export function dessinerFeuImmeuble(ctx, immeuble, cam, carte) {
    const etat = immeuble.etat;

    // Vérification de la visibilité (brouillard de guerre)
    // Centre de l'immeuble pour le test
    const centreX = immeuble.x + immeuble.largeur / 2;
    const centreY = immeuble.y + immeuble.hauteur / 2;
    
    if (!estVisible(centreX, centreY, cam, carte)) {
        // Silhouette grise uniquement si invisible
        ctx.fillStyle = 'rgba(60, 60, 60, 0.8)';
        ctx.fillRect(immeuble.x, immeuble.y, immeuble.largeur, immeuble.hauteur);
        return;
    }

    // Gestion de l'état calciné (prioritaire sur le feu actif si éteint)
    if (etat.calcine) {
        // Murs calcinés
        ctx.fillStyle = 'rgba(20,15,10,0.85)';
        ctx.fillRect(immeuble.x, immeuble.y, immeuble.largeur, immeuble.hauteur);

        // Fenêtres vides
        ctx.fillStyle = 'rgba(0,0,0,0.9)';
        for (const piece of immeuble.pieces) {
            ctx.fillRect(piece.x, piece.y, piece.largeur, piece.hauteur);
        }

        // Fumée résiduelle (décroissance sur 60s = 3600 frames)
        if (etat.fumeeRestante > 0) {
            dessinerFiletFumeeBlanche(ctx, immeuble.x + immeuble.largeur / 2, immeuble.y, etat.fumeeRestante);
        }
        return; // On sort, pas de feu actif ni de suie classique si calciné
    }

    if (etat.enFeu) {
        const avancee = etat.avancee;
        const totalPieces = immeuble.pieces.length;

        // 1. Flammes dans les fenêtres atteintes
        for (const piece of immeuble.pieces) {
            // Vérifier si l'étage de la pièce est atteint par l'avancée du feu
            // On suppose que piece.etage est l'indice ou la hauteur relative
            const ratioEtage = piece.etage / totalPieces;
            if (ratioEtage <= avancee) {
                dessinerFlammeFenetre(ctx, piece.x, piece.y, piece.largeur, piece.hauteur, etat.intensite);
            }
        }

        // 2. Lueur orange sur la rue
        ctx.fillStyle = 'rgba(255,120,0,0.15)';
        const lueurLargeur = immeuble.largeur * 2;
        const lueurX = immeuble.x - (lueurLargeur - immeuble.largeur) / 2;
        const lueurY = immeuble.y + immeuble.hauteur;
        ctx.fillRect(lueurX, lueurY, lueurLargeur, 40);

        // 3. Lueur sur les façades voisines
        ctx.fillStyle = 'rgba(255,80,0,0.08)';
        if (immeuble.voisins && immeuble.voisins.length > 0) {
            for (const voisin of immeuble.voisins) {
                // Overlay sur la façade visible du voisin
                // On dessine un rectangle couvrant la façade du voisin
                ctx.fillRect(voisin.x, voisin.y, voisin.largeur, voisin.hauteur);
            }
        }

        // 4. Braises au sol
        dessinerBraises(ctx, immeuble.x, immeuble.y + immeuble.hauteur, immeuble.largeur, etat.intensite);

        // 5. Colonne de fumée noire depuis le toit
        dessinerColonneFumee(ctx, immeuble.x + immeuble.largeur / 2, immeuble.y, etat.intensite);

    } else if (etat.suie) {
        // Suie sur les fenêtres
        ctx.fillStyle = 'rgba(40,40,40,0.6)';
        for (const piece of immeuble.pieces) {
            // Rectangle gris au-dessus de la fenêtre
            ctx.fillRect(piece.x, piece.y - 6, piece.largeur, 6);
        }

        // Fumée blanche résiduelle
        if (etat.fumeeRestante > 0) {
            dessinerFiletFumeeBlanche(ctx, immeuble.x + immeuble.largeur / 2, immeuble.y, etat.fumeeRestante);
        }
    }
}
