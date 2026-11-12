#include "PdrCommande.h"
#include "PdrOctets.h"
#include "PdrTypes.h"

namespace Pdr
{
	int64 RacineEntiere(int64 Valeur)
	{
		if (Valeur <= 0)
		{
			return 0;
		}
		// Methode chiffre par chiffre en base 4 : decalages, additions et comparaisons seulement.
		uint64 Reste = static_cast<uint64>(Valeur);
		uint64 Racine = 0;
		uint64 Bit = 1ull << 62;
		while (Bit > Reste)
		{
			Bit >>= 2;
		}
		while (Bit != 0)
		{
			if (Reste >= Racine + Bit)
			{
				Reste -= Racine + Bit;
				Racine = (Racine >> 1) + Bit;
			}
			else
			{
				Racine >>= 1;
			}
			Bit >>= 2;
		}
		return static_cast<int64>(Racine);
	}

	uint64 Fnv1a64(const uint8* Donnees, int32 Taille)
	{
		uint64 Empreinte = 0xcbf29ce484222325ull;
		for (int32 Indice = 0; Indice < Taille; ++Indice)
		{
			Empreinte ^= Donnees[Indice];
			Empreinte *= 0x100000001b3ull;
		}
		return Empreinte;
	}

	bool TypeCommandeValide(uint8 Type)
	{
		return Type >= static_cast<uint8>(ETypeCommande::CreerEscouade) && Type <= static_cast<uint8>(ETypeCommande::Retirer);
	}

	bool CommandeAvant(const FCommande& G, const FCommande& D)
	{
		if (G.Iteration != D.Iteration)
		{
			return G.Iteration < D.Iteration;
		}
		if (G.Joueur != D.Joueur)
		{
			return G.Joueur < D.Joueur;
		}
		if (G.Sequence != D.Sequence)
		{
			return G.Sequence < D.Sequence;
		}
		if (G.Type != D.Type)
		{
			return static_cast<uint8>(G.Type) < static_cast<uint8>(D.Type);
		}
		if (G.A != D.A)
		{
			return G.A < D.A;
		}
		if (G.B != D.B)
		{
			return G.B < D.B;
		}
		return G.C < D.C;
	}

	bool CommandesEgales(const FCommande& G, const FCommande& D)
	{
		return G.Iteration == D.Iteration && G.Joueur == D.Joueur && G.Sequence == D.Sequence
			&& G.Type == D.Type && G.A == D.A && G.B == D.B && G.C == D.C;
	}

	void InsererCommandeTriee(TArray<FCommande>& Commandes, const FCommande& Commande)
	{
		// Recherche de la premiere commande strictement posterieure : l'ordre final ne depend pas de l'ordre d'arrivee.
		int32 Bas = 0;
		int32 Haut = Commandes.Num();
		while (Bas < Haut)
		{
			const int32 Milieu = Bas + (Haut - Bas) / 2;
			if (CommandeAvant(Commande, Commandes[Milieu]))
			{
				Haut = Milieu;
			}
			else
			{
				Bas = Milieu + 1;
			}
		}
		Commandes.Insert(Commande, Bas);
	}
}
