#pragma once

#include "CoreMinimal.h"
#include "PdrCommande.h"
#include "PdrOctets.h"
#include "PdrTypes.h"

namespace Pdr
{
	/** Ce qui definit une partie avant sa premiere iteration. */
	struct FConfigPartie
	{
		uint64 Graine = 0;
	};

	struct FEscouade
	{
		int32 Id = 0;
		uint8 Joueur = 0;
		FVecMm Position;
		FVecMm Cible;
		/** En millimetres par iteration. */
		int32 Vitesse = 0;
		/** Vrai si et seulement si la vitesse est positive et la cible differente de la position. */
		bool bEnMouvement = false;
	};

	struct FEtat
	{
		/** Nombre d'iterations deja jouees. */
		int32 Iteration = 0;
		/** Etat du generateur aleatoire de la partie. */
		uint64 Alea = 0;
		/** Identifiant de la prochaine escouade creee. Un identifiant ne resert jamais. */
		int32 ProchainId = 1;
		/** Compteurs sans signe : ils reviennent a zero au lieu de deborder. */
		uint32 CommandesAppliquees = 0;
		uint32 CommandesIgnorees = 0;
		/** Triees par identifiant croissant. */
		TArray<FEscouade> Escouades;
	};

	/** Ce que FSimulation::Soumettre a fait de la commande. */
	enum class ESoumission : uint8
	{
		Acceptee = 0,
		/** Type inconnu, ou iteration negative ou au-dela de la derniere iteration jouable. Ne depend que de la commande. */
		Invalide,
		/** L'iteration de la commande est deja jouee. Depend de l'avancement de cette simulation. */
		Tardive,
		/** La file d'attente est au plafond. Depend de ce que cette simulation a deja recu et joue. */
		FilePleine,
	};

	/**
	 * La simulation. Elle n'a qu'une entree, les commandes, et avance par iterations de duree fixe.
	 * Meme configuration et memes commandes acceptees donnent le meme etat, donc la meme empreinte.
	 * Elle ne lit ni horloge ni fichier, et ne calcule qu'en entiers.
	 *
	 * Deplacement de l'etape A1 : en ligne droite, le pas etant tronque au millimetre sur chaque axe.
	 * La vitesse reelle depend donc de la direction : l'escouade perd moins de 1,5 mm par iteration, ce qui pese
	 * jusqu'a 29 % a la vitesse 1, 50 % a 2, 33 % a 3, 29 % a 4, 20 % a 5, et moins de 1 % a 150. Le dernier pas
	 * peut depasser la vitesse nominale de moins d'un millimetre. La navigation de l'etape A2 remplace ce deplacement.
	 */
	class PDRSIM_API FSimulation
	{
	public:
		explicit FSimulation(const FConfigPartie& InConfig = FConfigPartie());

		/**
		 * Met une commande en attente, ou dit pourquoi elle est refusee.
		 *
		 * Les refus Tardive et FilePleine ne dependent pas de la commande seule mais de l'histoire de cette
		 * simulation : deux postes qui recoivent les memes commandes a des moments ou dans des ordres differents
		 * peuvent ne pas garder les memes. En jeu a plusieurs, l'un comme l'autre vaut desynchronisation :
		 * c'est a la couche reseau de les rendre impossibles (delai d'entree, debit borne par joueur) et de
		 * traiter comme une faute fatale celui qui arrive quand meme. Le plafond n'est qu'un garde-fou memoire.
		 *
		 * Cout : logarithmique pour une commande posterieure a toutes celles en attente, lineaire sinon.
		 * Soumettre dans l'ordre du temps.
		 */
		ESoumission Soumettre(const FCommande& Commande);

		/** Joue une iteration : commandes de l'iteration dans l'ordre canonique, puis deplacements. */
		void Avancer();

		/** Avance jusqu'a ce que l'iteration courante vaille IterationCible. Ne recule jamais, ne depasse pas IterationMax. */
		void AvancerJusqua(int32 IterationCible);

		const FConfigPartie& LireConfig() const { return Config; }
		const FEtat& LireEtat() const { return Etat; }
		int32 CommandesEnAttente() const { return EnAttente.Num() - Tete; }

		/**
		 * Plus petit rang d'emission qui place une nouvelle commande de ce joueur apres toutes ses commandes
		 * en attente : zero s'il n'en a aucune. A lire apres un chargement, la sauvegarde ne gardant pas le
		 * compteur de l'emetteur. Plafonne a la plus grande valeur d'un rang.
		 */
		uint32 SequenceLibre(uint8 Joueur) const;

		/** Empreinte de l'etat seul, sans la configuration ni les commandes en attente. */
		uint64 Empreinte() const;

		/**
		 * Configuration, etat et commandes en attente : de quoi reprendre la simulation, et elle seule.
		 * Ni le rang d'emission des joueurs (voir SequenceLibre) ni le journal d'un enregistreur n'y sont :
		 * une partie rechargee ne peut plus produire sa relecture.
		 */
		void Serialiser(FEcrivain& Ecrivain) const;

		/**
		 * Remplace la simulation par celle qui a ete serialisee. N'accepte qu'une sauvegarde bien formee,
		 * coherente et sous sa forme canonique : ce qui est accepte se reecrit a l'octet pres. Cela ne prouve
		 * pas qu'une vraie partie mene a cet etat. En cas d'echec, rend faux et ne change rien.
		 */
		bool Deserialiser(FLecteur& Lecteur);

	private:
		void EcrireEtat(FEcrivain& Ecrivain) const;
		void Appliquer(const FCommande& Commande);
		void DeplacerEscouades();
		int32 IndiceEscouade(int32 Id) const;

		FConfigPartie Config;
		FEtat Etat;
		/**
		 * Triees selon CommandeAvant. Les Tete premieres sont deja appliquees : elles restent en place jusqu'au
		 * prochain tassement, pour que retirer en tete ne deplace pas toute la file a chaque iteration.
		 * Aucune des suivantes n'a une iteration deja jouee.
		 */
		TArray<FCommande> EnAttente;
		int32 Tete = 0;
	};
}
