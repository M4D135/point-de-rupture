#pragma once

#include "CoreMinimal.h"

// Types de base de la simulation. Entiers seulement : aucun flottant dans ce module.
namespace Pdr
{
	/** Cadence de la simulation, en iterations par seconde. */
	inline constexpr int32 IterationsParSeconde = 20;

	/** Version du format d'etat et de relecture. A augmenter quand une relecture ancienne cesse d'etre rejouable. */
	inline constexpr int32 VersionFormat = 1;

	/** Derniere iteration atteignable (plus de trois ans de jeu). Au-dela, la simulation n'avance plus. */
	inline constexpr int32 IterationMax = 2000000000;

	/** Borne du monde, en millimetres, de part et d'autre de l'origine. Elle garde tous les calculs dans 64 bits. */
	inline constexpr int32 LimiteMonde = 1000000000;

	/** Vitesse maximale d'une escouade, en millimetres par iteration. */
	inline constexpr int32 VitesseMax = 100000;

	/** Nombre maximal d'escouades vivantes. */
	inline constexpr int32 EscouadesMax = 4096;

	/** Nombre maximal de commandes en attente dans un etat enregistre. */
	inline constexpr int32 CommandesEnAttenteMax = 1000000;

	/** Position en millimetres. */
	struct FVecMm
	{
		int32 X = 0;
		int32 Y = 0;

		friend bool operator==(const FVecMm& G, const FVecMm& D) { return G.X == D.X && G.Y == D.Y; }
		friend bool operator!=(const FVecMm& G, const FVecMm& D) { return !(G == D); }
	};

	/** Racine carree entiere, arrondie vers le bas. Rend 0 pour toute valeur negative ou nulle. */
	PDRSIM_API int64 RacineEntiere(int64 Valeur);

	/** Ramene une valeur dans [Min, Max]. */
	inline int32 Borner(int32 Valeur, int32 Min, int32 Max)
	{
		return Valeur < Min ? Min : (Valeur > Max ? Max : Valeur);
	}
}
