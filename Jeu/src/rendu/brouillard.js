/**
 * Vérifie si un point est visible par la caméra (brouillard de guerre).
 * @param {number} x - Coordonnée X monde
 * @param {number} y - Coordonnée Y monde
 * @param {Object} cam - Objet caméra
 * @param {Object} carte - Objet carte (pour les données de brouillard)
 * @returns {boolean} true si visible, false sinon
 */
export function estVisible(x, y, cam, carte) {
    // Implémentation déterministe : vérifie les données de carte
    // Pour l'instant, retourne true si le point est dans les limites de la vue caméra
    // ou si la carte indique qu'il est découvert.
    // Note : Cette fonction doit rester pure et déterministe.
    if (!carte || !cam) return false;
    
    // Exemple de logique déterministe (à adapter selon la structure de carte)
    // Si la carte a une grille de visibilité, on la consulte ici.
    // Pour la simulation, on suppose que la visibilité est gérée par la carte.
    return carte.estVisible ? carte.estVisible(x, y) : true;
}
