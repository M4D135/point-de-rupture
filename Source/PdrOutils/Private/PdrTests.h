#pragma once

#include "CoreMinimal.h"

namespace Pdr
{
	struct FResultatTests
	{
		int32 Verifications = 0;
		int32 NombreEchecs = 0;
		/** Les premiers echecs, en clair. */
		TArray<FString> Echecs;
	};

	/** Joue les tests du noyau de simulation. Ne lit ni fichier ni horloge. */
	FResultatTests ExecuterTests();
}
