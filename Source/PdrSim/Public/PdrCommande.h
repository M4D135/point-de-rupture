#pragma once

#include "CoreMinimal.h"

namespace Pdr
{
	/** Les commandes de l'etape A1. Les valeurs sont ecrites dans les relectures : ne jamais les renumeroter. */
	enum class ETypeCommande : uint8
	{
		Aucune = 0,
		/** A = X, B = Y, C = vitesse en millimetres par iteration. */
		CreerEscouade = 1,
		/** A = identifiant de l'escouade, B = X, C = Y. */
		Deplacer = 2,
		/** A = identifiant de l'escouade. */
		Arreter = 3,
		/** A = identifiant de l'escouade. */
		Retirer = 4,
	};

	/** Une commande : la seule entree de la simulation. */
	struct FCommande
	{
		/** Iteration a laquelle la commande s'applique. */
		int32 Iteration = 0;
		uint8 Joueur = 0;
		/** Rang d'emission chez ce joueur. Departage ses commandes d'une meme iteration. */
		uint32 Sequence = 0;
		ETypeCommande Type = ETypeCommande::Aucune;
		int32 A = 0;
		int32 B = 0;
		int32 C = 0;
	};

	/** Vrai si l'octet designe une commande connue, hors Aucune. */
	PDRSIM_API bool TypeCommandeValide(uint8 Type);

	/** Ordre canonique d'application : iteration, joueur, sequence, puis le contenu pour departager. */
	PDRSIM_API bool CommandeAvant(const FCommande& G, const FCommande& D);

	PDRSIM_API bool CommandesEgales(const FCommande& G, const FCommande& D);

	/** Insere dans une liste deja triee selon CommandeAvant, apres les commandes egales. */
	PDRSIM_API void InsererCommandeTriee(TArray<FCommande>& Commandes, const FCommande& Commande);
}
