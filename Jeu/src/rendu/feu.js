/**
 * Dessine une flamme dans une fenêtre.
 */
export function dessinerFlammeFenetre(ctx, x, y, largeur, hauteur, intensite) {
    // Implémentation existante ou placeholder si manquante
    ctx.fillStyle = `rgba(255, 100, 0, ${0.8 * intensite})`;
    ctx.fillRect(x, y, largeur, hauteur);
}

/**
 * Dessine des braises au sol.
 */
export function dessinerBraises(ctx, x, y, largeur, intensite) {
    // Implémentation existante ou placeholder
    ctx.fillStyle = `rgba(255, 50, 0, ${0.5 * intensite})`;
    ctx.fillRect(x, y, largeur, 5);
}

/**
 * Dessine une colonne de fumée noire.
 */
export function dessinerColonneFumee(ctx, x, y, intensite) {
    // Implémentation existante ou placeholder
    ctx.fillStyle = `rgba(0, 0, 0, ${0.6 * intensite})`;
    ctx.fillRect(x - 5, y - 100, 10, 100);
}

/**
 * Dessine un filet de fumée blanche qui monte et s'élargit.
 * @param {CanvasRenderingContext2D} ctx 
 * @param {number} x 
 * @param {number} y 
 * @param {number} intensite (0 à 1)
 */
export function dessinerFiletFumeeBlanche(ctx, x, y, intensite) {
    if (intensite <= 0) return;

    const hauteurFumee = 50;
    const largeurBase = 4;
    const largeurHaut = 12;
    
    ctx.fillStyle = `rgba(220, 220, 220, ${0.4 * intensite})`;
    
    ctx.beginPath();
    ctx.moveTo(x - largeurBase / 2, y);
    ctx.lineTo(x + largeurBase / 2, y);
    ctx.lineTo(x + largeurHaut / 2, y - hauteurFumee);
    ctx.lineTo(x - largeurHaut / 2, y - hauteurFumee);
    ctx.closePath();
    ctx.fill();
}
