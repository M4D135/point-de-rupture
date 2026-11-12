#pragma once

#include "CoreMinimal.h"
#include "PdrOctets.h"
#include "PdrRelecture.h"

// Ce que l'executeur sans affichage fait sans fichier, sans horloge et sans journal : lire sa ligne de commande,
// ordonner des noms de fichiers, tenir le bilan d'une relecture. Tout cela est donc verifie par la suite (-tests).
namespace PdrOutils
{
	// Bornes des options. Au-dela, une mesure perd son sens, un nom de fichier change de forme ou un texte ne tient plus en memoire.

	/** Une relecture de cette duree tient largement dans une seule chaine (voir FormaterRelecture). */
	inline constexpr uint64 IterationsOutilMax = 10000000;
	/** A 150 mm par iteration, les escouades de -boucle mettent plus de 9,4 millions d'iterations a traverser le monde. */
	inline constexpr uint64 BoucleMax = 9000000;
	/** Le nom des fichiers de parties porte cinq chiffres : au-dela, l'ordre des noms ne serait plus celui des graines. */
	inline constexpr uint64 PartiesMax = 99999;
	inline constexpr uint64 ChargeMax = 1000000;
	inline constexpr uint64 CommandesParIterationMax = 64;

	/** Ce que demande une ligne de commande, une fois lue en entier et verifiee. Un champ ne vaut que si son drapeau est vrai. */
	struct FOptions
	{
		bool bTests = false;
		bool bBoucle = false;
		bool bEscouades = false;
		bool bCharge = false;
		bool bCommandes = false;
		bool bFile = false;
		bool bRelectures = false;
		bool bIterations = false;
		bool bGraine = false;
		bool bAttendu = false;
		bool bDossier = false;
		bool bEnregistrer = false;
		bool bRelire = false;

		int32 Boucle = 0;
		int32 Escouades = 0;
		int32 Charge = 0;
		int32 CommandesParIteration = 8;
		int32 File = 0;
		int32 Parties = 0;
		int32 Iterations = 10000;
		uint64 Graine = 1;
		uint64 Attendu = 0;
		FString Dossier;
		FString Enregistrer;
		FString Relire;

		bool UneActionDemandee() const
		{
			return bTests || bBoucle || bCharge || bFile || bRelectures || bEnregistrer || bRelire;
		}
	};

	/**
	 * Lit les options de l'executeur dans la ligne de commande que recoit le commandlet. Rend faux, avec un message par
	 * faute, si une option du projet est mal ecrite, hors bornes, donnee deux fois, ou donnee sans l'action qui s'en
	 * sert. Rien n'est arrondi, coupe ni complete : la meme ligne donne la meme chose sur toute machine, ou une erreur.
	 * Les noms se lisent sans egard a la casse. Les options du moteur, que le projet ne connait pas, sont ignorees.
	 *
	 * La ligne est decoupee en jetons separes par des blancs ; une valeur qui contient un blanc s'ecrit entre guillemets.
	 * Les chemins sont absolus : le moteur resout un chemin relatif dans le dossier de ses propres binaires.
	 */
	bool LireOptions(const FString& LigneDeCommande, FOptions& Options, TArray<FString>& Fautes);

	/**
	 * Ordre des caracteres, casse comprise : le meme sur toute machine, et celui des graines pour les fichiers
	 * qu'ecrit -relectures.
	 */
	void TrierNomsDeParties(TArray<FString>& Noms);

	/**
	 * Ajoute une partie a un condense : son en-tete, puis des empreintes. A l'enregistrement, celles que la partie vient
	 * de produire ; a la relecture, celles que la simulation a recalculees, jamais celles du fichier. Deux executions
	 * qui affichent le meme condense ont donc calcule les memes etats.
	 */
	void Condenser(Pdr::FEcrivain& Condense, const Pdr::FRelecture& Partie, const TArray<Pdr::FEmpreinteDatee>& Empreintes);

	/** Bilan d'une relecture de fichiers, tenu texte apres texte dans l'ordre ou ils sont donnes. */
	class FBilanDeRelecture
	{
	public:
		/**
		 * Analyse le texte d'une partie, la rejoue et l'ajoute au condense avec les empreintes recalculees.
		 * Rend vrai si la partie se rejoue a l'identique ; sinon Motif dit pourquoi. Un texte illisible compte
		 * comme un fichier non conforme et n'entre pas dans le condense.
		 */
		bool Ajouter(const FString& Texte, FString& Motif);

		/** Compte un fichier que l'on n'a pas pu lire : ni conforme, ni condense. */
		void AjouterIllisible();

		int32 Fichiers() const { return NombreFichiers; }
		int32 Conformes() const { return NombreConformes; }
		uint64 Condense() const;

	private:
		Pdr::FEcrivain Octets;
		int32 NombreFichiers = 0;
		int32 NombreConformes = 0;
	};
}
