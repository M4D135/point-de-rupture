#pragma once

#include "CoreMinimal.h"

// Module de simulation de POINT DE RUPTURE. Vide pour l'instant.
// Regles : aucune classe de jeu du moteur, aucun flottant, aucune lecture d'horloge.
namespace Pdr
{
	/** Version du format de simulation. Elle change quand une relecture ancienne cesse d'etre rejouable. */
	PDRSIM_API int32 VersionSimulation();
}
