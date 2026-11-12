#include "PdrSimulation.h"

namespace Pdr
{
	FSimulation::FSimulation(const FConfigPartie& InConfig)
		: Config(InConfig)
	{
		Etat.Alea = InConfig.Graine;
	}

	ESoumission FSimulation::Soumettre(const FCommande& Commande)
	{
		// D'abord ce qui ne depend que de la commande, ensuite ce qui depend de l'histoire de cette simulation.
		if (!TypeCommandeValide(static_cast<uint8>(Commande.Type)) || Commande.Iteration < 0 || Commande.Iteration >= IterationMax)
		{
			return ESoumission::Invalide;
		}
		if (Commande.Iteration < Etat.Iteration)
		{
			return ESoumission::Tardive;
		}
		if (CommandesEnAttente() >= CommandesEnAttenteMax)
		{
			return ESoumission::FilePleine;
		}
		// Les commandes deja appliquees, en tete, sont toutes anterieures : la recherche tombe apres elles.
		InsererCommandeTriee(EnAttente, Commande);
		return ESoumission::Acceptee;
	}

	uint32 FSimulation::SequenceLibre(uint8 Joueur) const
	{
		bool bTrouvee = false;
		uint32 Derniere = 0;
		for (int32 Indice = Tete; Indice < EnAttente.Num(); ++Indice)
		{
			const FCommande& Commande = EnAttente[Indice];
			if (Commande.Joueur == Joueur && (!bTrouvee || Commande.Sequence > Derniere))
			{
				bTrouvee = true;
				Derniere = Commande.Sequence;
			}
		}
		if (!bTrouvee)
		{
			return 0;
		}
		return Derniere == MAX_uint32 ? MAX_uint32 : Derniere + 1;
	}

	void FSimulation::Avancer()
	{
		if (Etat.Iteration >= IterationMax)
		{
			return;
		}

		// 1. Les commandes de cette iteration, dans l'ordre canonique. Ce sont les premieres qui attendent.
		while (Tete < EnAttente.Num() && EnAttente[Tete].Iteration == Etat.Iteration)
		{
			Appliquer(EnAttente[Tete]);
			++Tete;
		}
		// Tassement : seulement quand il reste au plus autant de commandes qu'il en a ete appliquees depuis le dernier.
		// Il en deplace donc au plus autant qu'il vient d'en etre jouees : le cout total reste proportionnel au nombre
		// de commandes jouees, quelle que soit la longueur de la file.
		if (Tete > 0 && EnAttente.Num() - Tete <= Tete)
		{
			EnAttente.RemoveAt(0, Tete);
			Tete = 0;
		}

		// 2. Les deplacements, dans l'ordre des identifiants.
		DeplacerEscouades();

		// 3. L'iteration suivante.
		++Etat.Iteration;
	}

	void FSimulation::AvancerJusqua(int32 IterationCible)
	{
		const int32 Cible = IterationCible < IterationMax ? IterationCible : IterationMax;
		while (Etat.Iteration < Cible)
		{
			Avancer();
		}
	}

	int32 FSimulation::IndiceEscouade(int32 Id) const
	{
		int32 Bas = 0;
		int32 Haut = Etat.Escouades.Num();
		while (Bas < Haut)
		{
			const int32 Milieu = Bas + (Haut - Bas) / 2;
			if (Etat.Escouades[Milieu].Id < Id)
			{
				Bas = Milieu + 1;
			}
			else
			{
				Haut = Milieu;
			}
		}
		return (Bas < Etat.Escouades.Num() && Etat.Escouades[Bas].Id == Id) ? Bas : INDEX_NONE;
	}

	void FSimulation::Appliquer(const FCommande& Commande)
	{
		bool bAppliquee = false;

		switch (Commande.Type)
		{
		case ETypeCommande::CreerEscouade:
		{
			if (Etat.Escouades.Num() < EscouadesMax && Etat.ProchainId < MAX_int32)
			{
				FEscouade Nouvelle;
				Nouvelle.Id = Etat.ProchainId++;
				Nouvelle.Joueur = Commande.Joueur;
				Nouvelle.Position.X = Borner(Commande.A, -LimiteMonde, LimiteMonde);
				Nouvelle.Position.Y = Borner(Commande.B, -LimiteMonde, LimiteMonde);
				Nouvelle.Cible = Nouvelle.Position;
				Nouvelle.Vitesse = Borner(Commande.C, 0, VitesseMax);
				Nouvelle.bEnMouvement = false;
				// Le nouvel identifiant est le plus grand : la liste reste triee.
				Etat.Escouades.Add(Nouvelle);
				bAppliquee = true;
			}
			break;
		}
		case ETypeCommande::Deplacer:
		{
			const int32 Indice = IndiceEscouade(Commande.A);
			if (Indice != INDEX_NONE && Etat.Escouades[Indice].Joueur == Commande.Joueur)
			{
				FEscouade& Escouade = Etat.Escouades[Indice];
				Escouade.Cible.X = Borner(Commande.B, -LimiteMonde, LimiteMonde);
				Escouade.Cible.Y = Borner(Commande.C, -LimiteMonde, LimiteMonde);
				Escouade.bEnMouvement = Escouade.Vitesse > 0 && Escouade.Cible != Escouade.Position;
				bAppliquee = true;
			}
			break;
		}
		case ETypeCommande::Arreter:
		{
			const int32 Indice = IndiceEscouade(Commande.A);
			if (Indice != INDEX_NONE && Etat.Escouades[Indice].Joueur == Commande.Joueur)
			{
				FEscouade& Escouade = Etat.Escouades[Indice];
				Escouade.Cible = Escouade.Position;
				Escouade.bEnMouvement = false;
				bAppliquee = true;
			}
			break;
		}
		case ETypeCommande::Retirer:
		{
			const int32 Indice = IndiceEscouade(Commande.A);
			if (Indice != INDEX_NONE && Etat.Escouades[Indice].Joueur == Commande.Joueur)
			{
				Etat.Escouades.RemoveAt(Indice);
				bAppliquee = true;
			}
			break;
		}
		case ETypeCommande::Aucune:
		default:
			break;
		}

		if (bAppliquee)
		{
			++Etat.CommandesAppliquees;
		}
		else
		{
			++Etat.CommandesIgnorees;
		}
	}

	void FSimulation::DeplacerEscouades()
	{
		for (FEscouade& Escouade : Etat.Escouades)
		{
			if (!Escouade.bEnMouvement)
			{
				continue;
			}
			// Positions bornees a LimiteMonde : les ecarts tiennent dans 2 x 10^9 et la somme de leurs carres dans 64 bits.
			const int64 EcartX = static_cast<int64>(Escouade.Cible.X) - static_cast<int64>(Escouade.Position.X);
			const int64 EcartY = static_cast<int64>(Escouade.Cible.Y) - static_cast<int64>(Escouade.Position.Y);
			const int64 Distance = RacineEntiere(EcartX * EcartX + EcartY * EcartY);
			const int64 Pas = static_cast<int64>(Escouade.Vitesse);
			if (Distance <= Pas)
			{
				Escouade.Position = Escouade.Cible;
				Escouade.bEnMouvement = false;
				continue;
			}
			// La division entiere tronque vers zero : meme resultat sur toute machine, et jamais de depassement de la cible.
			int32 PasX = static_cast<int32>(EcartX * Pas / Distance);
			int32 PasY = static_cast<int32>(EcartY * Pas / Distance);
			if (PasX == 0 && PasY == 0 && Pas > 0)
			{
				// N'arrive qu'a 1 mm par iteration, en biais : avancer d'un millimetre sur le plus grand ecart.
				const int64 AbsoluX = EcartX < 0 ? -EcartX : EcartX;
				const int64 AbsoluY = EcartY < 0 ? -EcartY : EcartY;
				if (AbsoluX >= AbsoluY)
				{
					PasX = EcartX > 0 ? 1 : -1;
				}
				else
				{
					PasY = EcartY > 0 ? 1 : -1;
				}
			}
			Escouade.Position.X += PasX;
			Escouade.Position.Y += PasY;
		}
	}

	void FSimulation::EcrireEtat(FEcrivain& Ecrivain) const
	{
		Ecrivain.I32(VersionFormat);
		Ecrivain.I32(Etat.Iteration);
		Ecrivain.U64(Etat.Alea);
		Ecrivain.I32(Etat.ProchainId);
		Ecrivain.U32(Etat.CommandesAppliquees);
		Ecrivain.U32(Etat.CommandesIgnorees);
		Ecrivain.I32(Etat.Escouades.Num());
		for (const FEscouade& Escouade : Etat.Escouades)
		{
			Ecrivain.I32(Escouade.Id);
			Ecrivain.U8(Escouade.Joueur);
			Ecrivain.I32(Escouade.Position.X);
			Ecrivain.I32(Escouade.Position.Y);
			Ecrivain.I32(Escouade.Cible.X);
			Ecrivain.I32(Escouade.Cible.Y);
			Ecrivain.I32(Escouade.Vitesse);
			Ecrivain.U8(Escouade.bEnMouvement ? 1 : 0);
		}
	}

	uint64 FSimulation::Empreinte() const
	{
		FEcrivain Ecrivain;
		EcrireEtat(Ecrivain);
		return Fnv1a64(Ecrivain.Lire());
	}

	void FSimulation::Serialiser(FEcrivain& Ecrivain) const
	{
		Ecrivain.U64(Config.Graine);
		EcrireEtat(Ecrivain);
		Ecrivain.I32(CommandesEnAttente());
		for (int32 Indice = Tete; Indice < EnAttente.Num(); ++Indice)
		{
			const FCommande& Commande = EnAttente[Indice];
			Ecrivain.I32(Commande.Iteration);
			Ecrivain.U8(Commande.Joueur);
			Ecrivain.U32(Commande.Sequence);
			Ecrivain.U8(static_cast<uint8>(Commande.Type));
			Ecrivain.I32(Commande.A);
			Ecrivain.I32(Commande.B);
			Ecrivain.I32(Commande.C);
		}
	}

	bool FSimulation::Deserialiser(FLecteur& Lecteur)
	{
		FConfigPartie NouvelleConfig;
		FEtat NouvelEtat;
		TArray<FCommande> NouvellesCommandes;

		NouvelleConfig.Graine = Lecteur.U64();
		if (Lecteur.I32() != VersionFormat)
		{
			return false;
		}
		NouvelEtat.Iteration = Lecteur.I32();
		NouvelEtat.Alea = Lecteur.U64();
		NouvelEtat.ProchainId = Lecteur.I32();
		NouvelEtat.CommandesAppliquees = Lecteur.U32();
		NouvelEtat.CommandesIgnorees = Lecteur.U32();
		const int32 NombreEscouades = Lecteur.I32();
		if (!Lecteur.Ok() || NouvelEtat.Iteration < 0 || NouvelEtat.Iteration > IterationMax
			|| NouvelEtat.ProchainId < 1 || NombreEscouades < 0 || NombreEscouades > EscouadesMax)
		{
			return false;
		}

		NouvelEtat.Escouades.Reserve(NombreEscouades);
		int32 IdPrecedent = 0;
		for (int32 Indice = 0; Indice < NombreEscouades; ++Indice)
		{
			FEscouade Escouade;
			Escouade.Id = Lecteur.I32();
			Escouade.Joueur = Lecteur.U8();
			Escouade.Position.X = Lecteur.I32();
			Escouade.Position.Y = Lecteur.I32();
			Escouade.Cible.X = Lecteur.I32();
			Escouade.Cible.Y = Lecteur.I32();
			Escouade.Vitesse = Lecteur.I32();
			const uint8 EnMouvement = Lecteur.U8();
			if (!Lecteur.Ok())
			{
				return false;
			}
			const bool bDansLeMonde =
				Escouade.Position.X >= -LimiteMonde && Escouade.Position.X <= LimiteMonde
				&& Escouade.Position.Y >= -LimiteMonde && Escouade.Position.Y <= LimiteMonde
				&& Escouade.Cible.X >= -LimiteMonde && Escouade.Cible.X <= LimiteMonde
				&& Escouade.Cible.Y >= -LimiteMonde && Escouade.Cible.Y <= LimiteMonde;
			// Identifiants strictement croissants et tous deja attribues.
			if (Escouade.Id <= IdPrecedent || Escouade.Id >= NouvelEtat.ProchainId
				|| !bDansLeMonde || Escouade.Vitesse < 0 || Escouade.Vitesse > VitesseMax || EnMouvement > 1)
			{
				return false;
			}
			// La marche se deduit du reste : en mouvement si et seulement si l'escouade a une vitesse et une cible a atteindre.
			const bool bDoitMarcher = Escouade.Vitesse > 0 && Escouade.Cible != Escouade.Position;
			if ((EnMouvement == 1) != bDoitMarcher)
			{
				return false;
			}
			Escouade.bEnMouvement = EnMouvement == 1;
			IdPrecedent = Escouade.Id;
			NouvelEtat.Escouades.Add(Escouade);
		}

		const int32 NombreCommandes = Lecteur.I32();
		if (!Lecteur.Ok() || NombreCommandes < 0 || NombreCommandes > CommandesEnAttenteMax)
		{
			return false;
		}
		for (int32 Indice = 0; Indice < NombreCommandes; ++Indice)
		{
			FCommande Commande;
			Commande.Iteration = Lecteur.I32();
			Commande.Joueur = Lecteur.U8();
			Commande.Sequence = Lecteur.U32();
			const uint8 Type = Lecteur.U8();
			Commande.A = Lecteur.I32();
			Commande.B = Lecteur.I32();
			Commande.C = Lecteur.I32();
			if (!Lecteur.Ok() || !TypeCommandeValide(Type)
				|| Commande.Iteration < NouvelEtat.Iteration || Commande.Iteration >= IterationMax)
			{
				return false;
			}
			Commande.Type = static_cast<ETypeCommande>(Type);
			if (Indice > 0 && CommandeAvant(Commande, NouvellesCommandes[Indice - 1]))
			{
				return false;
			}
			NouvellesCommandes.Add(Commande);
		}

		if (!Lecteur.Fini())
		{
			return false;
		}

		Config = NouvelleConfig;
		Etat = MoveTemp(NouvelEtat);
		EnAttente = MoveTemp(NouvellesCommandes);
		Tete = 0;
		return true;
	}
}
