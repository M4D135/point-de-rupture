export function choisirLampes(foyers, immeubles, max) {
    // Séparer les immeubles en feu des autres
    const enFeu = [];
    const autres = [];
    
    for (let i = 0; i < immeubles.length; i++) {
        const immeuble = immeubles[i];
        if (immeuble.etat && immeuble.etat.enFeu === true) {
            enFeu.push(immeuble);
        } else {
            autres.push(immeuble);
        }
    }

    // Trier les immeubles en feu par intensité décroissante
    enFeu.sort((a, b) => {
        const intA = a.etat && a.etat.intensite !== undefined ? a.etat.intensite : 0;
        const intB = b.etat && b.etat.intensite !== undefined ? b.etat.intensite : 0;
        return intB - intA;
    });

    // Fonction utilitaire pour trier par distance caméra
    const trierParDistance = (liste) => {
        return liste.sort((a, b) => {
            const distA = a.distanceCaméra !== undefined ? a.distanceCaméra : (a.distance !== undefined ? a.distance : 0);
            const distB = b.distanceCaméra !== undefined ? b.distanceCaméra : (b.distance !== undefined ? b.distance : 0);
            return distA - distB;
        });
    };

    const foyersTries = trierParDistance([...foyers]);
    const autresTries = trierParDistance([...autres]);

    // Construire la liste finale : enFeu, puis foyers, puis autres
    const listeComplete = [...enFeu, ...foyersTries, ...autresTries];

    // Tronquer à max (8)
    let resultat = listeComplete.slice(0, max);

    // Vérifier le budget de 6000 instances
    // On suppose que chaque élément compte comme 1 instance ou qu'il faut vérifier une propriété 'instances'
    // Si le total dépasse 6000, on retire les derniers éléments
    let totalInstances = 0;
    for (let i = 0; i < resultat.length; i++) {
        // Si l'objet a une propriété 'instances', on l'utilise, sinon on compte 1
        const inst = resultat[i].instances !== undefined ? resultat[i].instances : 1;
        totalInstances += inst;
    }

    while (totalInstances > 6000 && resultat.length > 0) {
        const dernier = resultat.pop();
        const inst = dernier.instances !== undefined ? dernier.instances : 1;
        totalInstances -= inst;
    }

    return resultat;
}
