#pragma once

#include "CoreMinimal.h"
#include "Commandlets/Commandlet.h"
#include "PdrSimCommandlet.generated.h"

/**
 * Executeur sans affichage du noyau de simulation. Chemins absolus seulement.
 *
 *   -run=PdrSim -tests
 *   -run=PdrSim -boucle=24000 [-escouades=200]                        iterations a vide, ou avec des escouades en marche
 *   -run=PdrSim -charge=24000 [-escouades=4096] [-commandes=8]        regime charge : ordres a chaque iteration, empreintes
 *   -run=PdrSim -file=100000                                          commandes soumises d'avance, une par iteration
 *   -run=PdrSim -relectures=100 -iterations=10000 [-dossier=<dossier>] [-attendu=<condense>]
 *   -run=PdrSim -enregistrer=<fichier> [-graine=1] [-iterations=10000]
 *   -run=PdrSim -relire=<fichier ou dossier> [-attendu=<condense>]
 *
 * Plusieurs actions peuvent etre demandees a la fois. Un nombre mal ecrit ou hors bornes est refuse, jamais arrondi.
 * Code de sortie : 0 si tout a reussi, 1 sinon, 2 si rien n'est demande.
 */
UCLASS()
class UPdrSimCommandlet : public UCommandlet
{
	GENERATED_BODY()

public:
	UPdrSimCommandlet();

	virtual int32 Main(const FString& Params) override;
};
