#pragma once

#include "CoreMinimal.h"
#include "PdrCommande.h"
#include "PdrSimulation.h"
#include "PdrTypes.h"

namespace Pdr
{
	/** Une empreinte de l'etat est relevee toutes les IntervalleEmpreintes iterations. */
	inline constexpr int32 IntervalleEmpreintes = 100;

	struct FEmpreinteDatee
	{
		/** Nombre d'iterations jouees au moment du releve. */
		int32 Iteration = 0;
		uint64 Empreinte = 0;
	};

	/** Une partie enregistree : sa configuration, ses commandes, et des empreintes pour verifier qu'elle se rejoue a l'identique. */
	struct FRelecture
	{
		int32 Version = VersionFormat;
		FConfigPartie Config;
		/** Nombre d'iterations jouees. */
		int32 Iterations = 0;
		/** Dans l'ordre canonique. Toutes ont ete jouees : leur iteration est inferieure a Iterations. */
		TArray<FCommande> Commandes;
		/** Par iteration croissante. La derniere porte sur l'etat final. */
		TArray<FEmpreinteDatee> Empreintes;
	};

	struct FRapportRelecture
	{
		/** Vrai si la relecture est bien formee et si toutes ses empreintes ont ete retrouvees. */
		bool bConforme = false;
		int32 EmpreintesVerifiees = 0;
		/** Iteration de la premiere empreinte qui differe, ou -1. */
		int32 PremiereDivergence = -1;
		/** Empreinte de l'etat ou la relecture s'est arretee. */
		uint64 EmpreinteFinale = 0;
		/**
		 * Les empreintes que la simulation a recalculees, dans l'ordre de celles de la relecture, la premiere
		 * qui differe comprise. C'est elles, et non celles du fichier, qu'il faut comparer d'une machine a l'autre.
		 */
		TArray<FEmpreinteDatee> Recalculees;
		/** Renseigne quand la relecture est mal formee. */
		FString Erreur;
	};

	/** Joue une partie en notant ce qu'il faut pour la rejouer. */
	class PDRSIM_API FEnregistreur
	{
	public:
		explicit FEnregistreur(const FConfigPartie& InConfig);

		/** Soumet la commande a la simulation et la note si elle est acceptee. */
		ESoumission Soumettre(const FCommande& Commande);

		/** Joue une iteration et releve l'empreinte quand l'intervalle est atteint. */
		void Avancer();

		void AvancerJusqua(int32 IterationCible);

		/** La relecture de la partie jouee jusqu'ici. L'enregistrement peut continuer ensuite. */
		FRelecture Extraire() const;

		const FSimulation& LireSimulation() const { return Simulation; }

	private:
		void ReleverEmpreinte();

		FSimulation Simulation;
		/** Les commandes acceptees, dans l'ordre canonique. */
		TArray<FCommande> Commandes;
		TArray<FEmpreinteDatee> Empreintes;
	};

	/** Vrai si la relecture est bien formee. Sinon, Erreur dit pourquoi. */
	PDRSIM_API bool ValiderRelecture(const FRelecture& Relecture, FString& Erreur);

	PDRSIM_API bool RelecturesEgales(const FRelecture& G, const FRelecture& D);

	/**
	 * Texte de la relecture. Une relecture n'a qu'un texte, et ce texte ne contient que de l'ASCII.
	 * Limite : le texte tient dans une seule chaine, soit au plus 68 caracteres par commande et 38 par empreinte
	 * pour deux milliards en tout. Une partie de plus de vingt millions de commandes demandera une ecriture par morceaux.
	 */
	PDRSIM_API FString FormaterRelecture(const FRelecture& Relecture);

	/**
	 * Lit un texte produit par FormaterRelecture. Lecture stricte, avec deux tolerances seulement : un retour
	 * chariot devant un saut de ligne (fins de ligne a la mode de Windows), et l'absence du dernier saut de ligne.
	 * En cas d'echec, rend faux et ne touche pas a Relecture.
	 */
	PDRSIM_API bool AnalyserRelecture(const FString& Texte, FRelecture& Relecture, FString& Erreur);

	/** Rejoue la partie et compare chaque empreinte. S'arrete a la premiere difference. */
	PDRSIM_API FRapportRelecture Rejouer(const FRelecture& Relecture);

	/**
	 * Joue et enregistre une partie de commandes tirees au sort. Meme graine et meme duree : meme partie.
	 * Le tirage cherche les cas limites : coordonnees et vitesses hors bornes, vitesses 0 et 1, joueur 255,
	 * escouades inconnues ou d'un autre joueur, et commandes que seul leur contenu departage.
	 */
	PDRSIM_API FRelecture GenererPartie(uint64 Graine, int32 Iterations);
}
