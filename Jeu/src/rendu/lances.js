// Tables précalculées pour la gerbe (déterminisme)
const NB_TRAITS_GERBE = 8;
const PAS_ANGLE = Math.PI / (NB_TRAITS_GERBE - 1);
const TABLE_COS = [];
const TABLE_SIN = [];
for (let i = 0; i < NB_TRAITS_GERBE; i++) {
    const angle = -Math.PI / 2 + i * PAS_ANGLE;
    TABLE_COS.push(Math.cos(angle));
    TABLE_SIN.push(Math.sin(angle));
}

export function dessinerLances(ctx, immeuble, cam) {
    const lances = immeuble.etat.lances;
    if (!lances || lances.length === 0) return;

    for (let i = 0; i < lances.length; i++) {
        const lance = lances[i];
        const { x0, y0, x1, y1, puissance } = lance;

        // Arc d'eau (Bézier quadratique)
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        const cx = x0 + (x1 - x0) * 0.5;
        const cy = y0 - 60 * puissance;
        ctx.quadraticCurveTo(cx, cy, x1, y1);
        ctx.strokeStyle = 'rgba(100,180,255,0.7)';
        ctx.lineWidth = 3 * puissance;
        ctx.stroke();

        // Gerbe à l’impact
        const longueurGerbe = 8 * puissance;
        ctx.strokeStyle = 'rgba(200,230,255,0.6)';
        ctx.lineWidth = 1;
        for (let j = 0; j < NB_TRAITS_GERBE; j++) {
            const dx = TABLE_COS[j] * longueurGerbe;
            const dy = TABLE_SIN[j] * longueurGerbe;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x1 + dx, y1 + dy);
            ctx.stroke();
        }

        // Nuage de vapeur
        ctx.beginPath();
        ctx.arc(x1, y1 - 10, 12 * puissance, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(220,220,220,0.3)';
        ctx.fill();
    }
}
