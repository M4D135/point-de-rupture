#include "PdrRelecture.h"

#include "PdrAlea.h"

namespace Pdr
{
	namespace
	{
		constexpr int32 JoueursScenario = 4;
		/** Le dernier joueur du scenario porte le plus grand identifiant possible. */
		constexpr uint8 IdsScenario[JoueursScenario] = { 0, 1, 2, 255 };
		constexpr int32 RayonScenario = 200000;

		/** Decoupe un texte sur un separateur, en gardant les morceaux vides. Rend toujours au moins un morceau. */
		void DecouperTexte(const FString& Texte, TCHAR Separateur, TArray<FString>& Morceaux)
		{
			Morceaux.Reset();
			const int32 Longueur = Texte.Len();
			int32 Debut = 0;
			for (int32 Indice = 0; Indice <= Longueur; ++Indice)
			{
				if (Indice == Longueur || Texte[Indice] == Separateur)
				{
					Morceaux.Add(Texte.Mid(Debut, Indice - Debut));
					Debut = Indice + 1;
				}
			}
		}

		/** Entier decimal sans signe : des chiffres seulement, sans zero de tete, sans depassement. */
		bool LireNonSigne(const FString& Jeton, uint64& Valeur)
		{
			const int32 Longueur = Jeton.Len();
			if (Longueur == 0 || Longueur > 20 || (Longueur > 1 && Jeton[0] == TEXT('0')))
			{
				return false;
			}
			uint64 Cumul = 0;
			for (int32 Indice = 0; Indice < Longueur; ++Indice)
			{
				const TCHAR Caractere = Jeton[Indice];
				if (Caractere < TEXT('0') || Caractere > TEXT('9'))
				{
					return false;
				}
				const uint64 Chiffre = static_cast<uint64>(Caractere - TEXT('0'));
				if (Cumul > (MAX_uint64 - Chiffre) / 10)
				{
					return false;
				}
				Cumul = Cumul * 10 + Chiffre;
			}
			Valeur = Cumul;
			return true;
		}

		/** Entier decimal signe dans [Min, Max]. Refuse le signe plus, le zero negatif et les zeros de tete. */
		bool LireEntier(const FString& Jeton, int64 Min, int64 Max, int64& Valeur)
		{
			const bool bNegatif = Jeton.Len() > 0 && Jeton[0] == TEXT('-');
			uint64 Absolu = 0;
			if (!LireNonSigne(bNegatif ? Jeton.Mid(1) : Jeton, Absolu))
			{
				return false;
			}
			if (Absolu > static_cast<uint64>(MAX_int64) || (bNegatif && Absolu == 0))
			{
				return false;
			}
			const int64 Signe = bNegatif ? -static_cast<int64>(Absolu) : static_cast<int64>(Absolu);
			if (Signe < Min || Signe > Max)
			{
				return false;
			}
			Valeur = Signe;
			return true;
		}

		bool LireEntier32(const FString& Jeton, int32 Min, int32 Max, int32& Valeur)
		{
			int64 Large = 0;
			if (!LireEntier(Jeton, Min, Max, Large))
			{
				return false;
			}
			Valeur = static_cast<int32>(Large);
			return true;
		}

		/** Seize chiffres hexadecimaux, en minuscules. */
		bool LireHexa16(const FString& Jeton, uint64& Valeur)
		{
			if (Jeton.Len() != 16)
			{
				return false;
			}
			uint64 Cumul = 0;
			for (int32 Indice = 0; Indice < 16; ++Indice)
			{
				const TCHAR Caractere = Jeton[Indice];
				uint64 Chiffre = 0;
				if (Caractere >= TEXT('0') && Caractere <= TEXT('9'))
				{
					Chiffre = static_cast<uint64>(Caractere - TEXT('0'));
				}
				else if (Caractere >= TEXT('a') && Caractere <= TEXT('f'))
				{
					Chiffre = 10 + static_cast<uint64>(Caractere - TEXT('a'));
				}
				else
				{
					return false;
				}
				Cumul = (Cumul << 4) | Chiffre;
			}
			Valeur = Cumul;
			return true;
		}

		bool MotEgal(const FString& Jeton, const TCHAR* Mot)
		{
			return Jeton.Equals(Mot, ESearchCase::CaseSensitive);
		}
	}

	FEnregistreur::FEnregistreur(const FConfigPartie& InConfig)
		: Simulation(InConfig)
	{
		ReleverEmpreinte();
	}

	ESoumission FEnregistreur::Soumettre(const FCommande& Commande)
	{
		const ESoumission Verdict = Simulation.Soumettre(Commande);
		if (Verdict == ESoumission::Acceptee)
		{
			InsererCommandeTriee(Commandes, Commande);
		}
		return Verdict;
	}

	void FEnregistreur::Avancer()
	{
		const int32 Avant = Simulation.LireEtat().Iteration;
		Simulation.Avancer();
		const int32 Apres = Simulation.LireEtat().Iteration;
		if (Apres != Avant && Apres % IntervalleEmpreintes == 0)
		{
			ReleverEmpreinte();
		}
	}

	void FEnregistreur::AvancerJusqua(int32 IterationCible)
	{
		const int32 Cible = IterationCible < IterationMax ? IterationCible : IterationMax;
		while (Simulation.LireEtat().Iteration < Cible)
		{
			Avancer();
		}
	}

	void FEnregistreur::ReleverEmpreinte()
	{
		FEmpreinteDatee Releve;
		Releve.Iteration = Simulation.LireEtat().Iteration;
		Releve.Empreinte = Simulation.Empreinte();
		Empreintes.Add(Releve);
	}

	FRelecture FEnregistreur::Extraire() const
	{
		FRelecture Resultat;
		Resultat.Version = VersionFormat;
		Resultat.Config = Simulation.LireConfig();
		Resultat.Iterations = Simulation.LireEtat().Iteration;

		// Les commandes prevues pour plus tard n'ont pas ete jouees : elles ne font pas partie de la relecture.
		Resultat.Commandes.Reserve(Commandes.Num());
		for (const FCommande& Commande : Commandes)
		{
			if (Commande.Iteration >= Resultat.Iterations)
			{
				break;
			}
			Resultat.Commandes.Add(Commande);
		}

		Resultat.Empreintes = Empreintes;
		if (Resultat.Empreintes.Num() == 0 || Resultat.Empreintes.Last().Iteration != Resultat.Iterations)
		{
			FEmpreinteDatee Finale;
			Finale.Iteration = Resultat.Iterations;
			Finale.Empreinte = Simulation.Empreinte();
			Resultat.Empreintes.Add(Finale);
		}
		return Resultat;
	}

	bool ValiderRelecture(const FRelecture& Relecture, FString& Erreur)
	{
		if (Relecture.Version != VersionFormat)
		{
			Erreur = FString::Printf(TEXT("version %d non prise en charge (attendue : %d)"), Relecture.Version, VersionFormat);
			return false;
		}
		if (Relecture.Iterations < 0 || Relecture.Iterations > IterationMax)
		{
			Erreur = FString::Printf(TEXT("nombre d'iterations hors limite : %d"), Relecture.Iterations);
			return false;
		}
		for (int32 Indice = 0; Indice < Relecture.Commandes.Num(); ++Indice)
		{
			const FCommande& Commande = Relecture.Commandes[Indice];
			if (!TypeCommandeValide(static_cast<uint8>(Commande.Type)))
			{
				Erreur = FString::Printf(TEXT("commande %d : type inconnu"), Indice + 1);
				return false;
			}
			if (Commande.Iteration < 0 || Commande.Iteration >= Relecture.Iterations)
			{
				Erreur = FString::Printf(TEXT("commande %d : iteration %d hors de la partie"), Indice + 1, Commande.Iteration);
				return false;
			}
			if (Indice > 0 && CommandeAvant(Commande, Relecture.Commandes[Indice - 1]))
			{
				Erreur = FString::Printf(TEXT("commande %d : hors de l'ordre canonique"), Indice + 1);
				return false;
			}
		}
		if (Relecture.Empreintes.Num() == 0)
		{
			Erreur = TEXT("aucune empreinte");
			return false;
		}
		int32 Precedente = -1;
		for (const FEmpreinteDatee& Releve : Relecture.Empreintes)
		{
			if (Releve.Iteration <= Precedente || Releve.Iteration > Relecture.Iterations)
			{
				Erreur = FString::Printf(TEXT("empreinte de l'iteration %d : hors d'ordre ou hors de la partie"), Releve.Iteration);
				return false;
			}
			Precedente = Releve.Iteration;
		}
		if (Precedente != Relecture.Iterations)
		{
			Erreur = TEXT("la derniere empreinte ne porte pas sur l'etat final");
			return false;
		}
		Erreur.Reset();
		return true;
	}

	bool RelecturesEgales(const FRelecture& G, const FRelecture& D)
	{
		if (G.Version != D.Version || G.Config.Graine != D.Config.Graine || G.Iterations != D.Iterations
			|| G.Commandes.Num() != D.Commandes.Num() || G.Empreintes.Num() != D.Empreintes.Num())
		{
			return false;
		}
		for (int32 Indice = 0; Indice < G.Commandes.Num(); ++Indice)
		{
			if (!CommandesEgales(G.Commandes[Indice], D.Commandes[Indice]))
			{
				return false;
			}
		}
		for (int32 Indice = 0; Indice < G.Empreintes.Num(); ++Indice)
		{
			if (G.Empreintes[Indice].Iteration != D.Empreintes[Indice].Iteration
				|| G.Empreintes[Indice].Empreinte != D.Empreintes[Indice].Empreinte)
			{
				return false;
			}
		}
		return true;
	}

	FString FormaterRelecture(const FRelecture& Relecture)
	{
		FString Texte;
		// Estimation calculee sur 64 bits : sur 32, une tres longue partie la ferait deborder.
		const int64 Estimation = 96 + static_cast<int64>(Relecture.Commandes.Num()) * 56 + static_cast<int64>(Relecture.Empreintes.Num()) * 40;
		if (Estimation < static_cast<int64>(MAX_int32))
		{
			Texte.Reserve(static_cast<int32>(Estimation));
		}
		Texte.Appendf(TEXT("pdr-relecture %d\n"), Relecture.Version);
		Texte.Appendf(TEXT("graine %llu\n"), Relecture.Config.Graine);
		Texte.Appendf(TEXT("iterations %d\n"), Relecture.Iterations);
		for (const FCommande& Commande : Relecture.Commandes)
		{
			Texte.Appendf(TEXT("cmd %d %d %u %d %d %d %d\n"),
				Commande.Iteration, static_cast<int32>(Commande.Joueur), Commande.Sequence,
				static_cast<int32>(Commande.Type), Commande.A, Commande.B, Commande.C);
		}
		for (const FEmpreinteDatee& Releve : Relecture.Empreintes)
		{
			Texte.Appendf(TEXT("empreinte %d %016llx\n"), Releve.Iteration, Releve.Empreinte);
		}
		Texte += TEXT("fin\n");
		return Texte;
	}

	bool AnalyserRelecture(const FString& Texte, FRelecture& Relecture, FString& Erreur)
	{
		const auto Echec = [&Erreur](int32 NumeroLigne, const TCHAR* Message) -> bool
		{
			Erreur = FString::Printf(TEXT("ligne %d : %s"), NumeroLigne, Message);
			return false;
		};

		TArray<FString> Lignes;
		DecouperTexte(Texte, TEXT('\n'), Lignes);
		// Fins de ligne de Windows : un retour chariot n'est retire que devant un saut de ligne, donc jamais du dernier morceau.
		for (int32 Rang = 0; Rang + 1 < Lignes.Num(); ++Rang)
		{
			FString& Ligne = Lignes[Rang];
			if (Ligne.Len() > 0 && Ligne[Ligne.Len() - 1] == TEXT('\r'))
			{
				Ligne.LeftChopInline(1);
			}
		}
		// Le saut de ligne qui termine le texte laisse un dernier morceau vide.
		if (Lignes.Num() > 0 && Lignes.Last().IsEmpty())
		{
			Lignes.Pop();
		}
		if (Lignes.Num() < 3)
		{
			return Echec(Lignes.Num() + 1, TEXT("texte tronque avant la fin de l'en-tete"));
		}

		FRelecture Lue;
		TArray<FString> Jetons;

		DecouperTexte(Lignes[0], TEXT(' '), Jetons);
		if (Jetons.Num() != 2 || !MotEgal(Jetons[0], TEXT("pdr-relecture")) || !LireEntier32(Jetons[1], 0, MAX_int32, Lue.Version))
		{
			return Echec(1, TEXT("ligne 'pdr-relecture <version>' attendue"));
		}
		if (Lue.Version != VersionFormat)
		{
			return Echec(1, TEXT("version non prise en charge"));
		}

		DecouperTexte(Lignes[1], TEXT(' '), Jetons);
		if (Jetons.Num() != 2 || !MotEgal(Jetons[0], TEXT("graine")) || !LireNonSigne(Jetons[1], Lue.Config.Graine))
		{
			return Echec(2, TEXT("ligne 'graine <entier sans signe>' attendue"));
		}

		DecouperTexte(Lignes[2], TEXT(' '), Jetons);
		if (Jetons.Num() != 2 || !MotEgal(Jetons[0], TEXT("iterations")) || !LireEntier32(Jetons[1], 0, IterationMax, Lue.Iterations))
		{
			return Echec(3, TEXT("ligne 'iterations <entier>' attendue"));
		}

		int32 Indice = 3;
		for (; Indice < Lignes.Num(); ++Indice)
		{
			DecouperTexte(Lignes[Indice], TEXT(' '), Jetons);
			if (!MotEgal(Jetons[0], TEXT("cmd")))
			{
				break;
			}
			FCommande Commande;
			int32 Joueur = 0;
			int32 Type = 0;
			int64 Sequence = 0;
			if (Jetons.Num() != 8
				|| !LireEntier32(Jetons[1], 0, MAX_int32, Commande.Iteration)
				|| !LireEntier32(Jetons[2], 0, 255, Joueur)
				|| !LireEntier(Jetons[3], 0, static_cast<int64>(MAX_uint32), Sequence)
				|| !LireEntier32(Jetons[4], 0, 255, Type)
				|| !LireEntier32(Jetons[5], MIN_int32, MAX_int32, Commande.A)
				|| !LireEntier32(Jetons[6], MIN_int32, MAX_int32, Commande.B)
				|| !LireEntier32(Jetons[7], MIN_int32, MAX_int32, Commande.C))
			{
				return Echec(Indice + 1, TEXT("commande mal formee"));
			}
			if (!TypeCommandeValide(static_cast<uint8>(Type)))
			{
				return Echec(Indice + 1, TEXT("type de commande inconnu"));
			}
			Commande.Joueur = static_cast<uint8>(Joueur);
			Commande.Sequence = static_cast<uint32>(Sequence);
			Commande.Type = static_cast<ETypeCommande>(Type);
			Lue.Commandes.Add(Commande);
		}

		for (; Indice < Lignes.Num(); ++Indice)
		{
			DecouperTexte(Lignes[Indice], TEXT(' '), Jetons);
			if (!MotEgal(Jetons[0], TEXT("empreinte")))
			{
				break;
			}
			FEmpreinteDatee Releve;
			if (Jetons.Num() != 3
				|| !LireEntier32(Jetons[1], 0, MAX_int32, Releve.Iteration)
				|| !LireHexa16(Jetons[2], Releve.Empreinte))
			{
				return Echec(Indice + 1, TEXT("empreinte mal formee"));
			}
			Lue.Empreintes.Add(Releve);
		}

		if (Indice != Lignes.Num() - 1 || !MotEgal(Lignes[Indice], TEXT("fin")))
		{
			return Echec(Indice + 1, TEXT("ligne inattendue, ou ligne 'fin' absente"));
		}

		FString Detail;
		if (!ValiderRelecture(Lue, Detail))
		{
			Erreur = Detail;
			return false;
		}

		Relecture = MoveTemp(Lue);
		Erreur.Reset();
		return true;
	}

	FRapportRelecture Rejouer(const FRelecture& Relecture)
	{
		FRapportRelecture Rapport;
		if (!ValiderRelecture(Relecture, Rapport.Erreur))
		{
			return Rapport;
		}

		FSimulation Simulation(Relecture.Config);
		int32 Suivante = 0;
		bool bConforme = true;
		for (const FEmpreinteDatee& Attendue : Relecture.Empreintes)
		{
			// Les commandes sont fournies au fil de l'eau : la file d'attente de la simulation reste courte.
			while (Simulation.LireEtat().Iteration < Attendue.Iteration)
			{
				const int32 Iteration = Simulation.LireEtat().Iteration;
				while (Suivante < Relecture.Commandes.Num() && Relecture.Commandes[Suivante].Iteration == Iteration)
				{
					if (Simulation.Soumettre(Relecture.Commandes[Suivante]) != ESoumission::Acceptee)
					{
						Rapport.Erreur = FString::Printf(TEXT("commande %d refusee par la simulation"), Suivante + 1);
						Rapport.EmpreinteFinale = Simulation.Empreinte();
						return Rapport;
					}
					++Suivante;
				}
				Simulation.Avancer();
			}
			FEmpreinteDatee Recalculee;
			Recalculee.Iteration = Attendue.Iteration;
			Recalculee.Empreinte = Simulation.Empreinte();
			Rapport.Recalculees.Add(Recalculee);
			if (Recalculee.Empreinte != Attendue.Empreinte)
			{
				Rapport.PremiereDivergence = Attendue.Iteration;
				bConforme = false;
				break;
			}
			++Rapport.EmpreintesVerifiees;
		}

		Rapport.EmpreinteFinale = Simulation.Empreinte();
		if (bConforme && Suivante != Relecture.Commandes.Num())
		{
			Rapport.Erreur = TEXT("des commandes n'ont pas ete jouees");
			return Rapport;
		}
		Rapport.bConforme = bConforme;
		return Rapport;
	}

	FRelecture GenererPartie(uint64 Graine, int32 Iterations)
	{
		FConfigPartie Config;
		Config.Graine = Graine;
		FEnregistreur Enregistreur(Config);

		// Le scenario a son propre generateur : il ne touche pas a celui de la simulation.
		// Chaque tirage a sa propre instruction : l'ordre des tirages ne depend pas du compilateur.
		FAlea Alea(Graine ^ 0xA5A5A5A55A5A5A5Aull);
		uint32 Sequences[JoueursScenario] = { 0, 0, 0, 0 };

		const auto Emettre = [&Enregistreur](int32 Iteration, int32 RangJoueur, uint32 Sequence, ETypeCommande Type, int32 A, int32 B, int32 C)
		{
			FCommande Commande;
			Commande.Iteration = Iteration;
			Commande.Joueur = IdsScenario[RangJoueur];
			Commande.Sequence = Sequence;
			Commande.Type = Type;
			Commande.A = A;
			Commande.B = B;
			Commande.C = C;
			Enregistreur.Soumettre(Commande);
		};

		// Les valeurs hors bornes sont voulues : la simulation doit les ramener a la limite.
		const auto TirerVitesse = [&Alea]() -> int32
		{
			const int32 Cas = Alea.Entre(0, 99);
			if (Cas < 3)
			{
				return 0;
			}
			if (Cas < 6)
			{
				return 1;
			}
			if (Cas < 8)
			{
				return VitesseMax;
			}
			if (Cas == 8)
			{
				return -1;
			}
			if (Cas == 9)
			{
				return VitesseMax + 1;
			}
			return Alea.Entre(20, 400);
		};

		const auto TirerCoordonnee = [&Alea]() -> int32
		{
			const int32 Cas = Alea.Entre(0, 199);
			if (Cas == 0)
			{
				return LimiteMonde;
			}
			if (Cas == 1)
			{
				return -LimiteMonde;
			}
			if (Cas == 2)
			{
				return MAX_int32;
			}
			if (Cas == 3)
			{
				return MIN_int32;
			}
			if (Cas == 4)
			{
				return -LimiteMonde - 1;
			}
			if (Cas == 5)
			{
				return LimiteMonde + 1;
			}
			return Alea.Entre(-RayonScenario, RayonScenario);
		};

		// Ouverture : quatre escouades par joueur.
		for (int32 RangJoueur = 0; RangJoueur < JoueursScenario; ++RangJoueur)
		{
			for (int32 Rang = 0; Rang < 4; ++Rang)
			{
				const int32 X = TirerCoordonnee();
				const int32 Y = TirerCoordonnee();
				const int32 Vitesse = TirerVitesse();
				const uint32 Sequence = Sequences[RangJoueur];
				++Sequences[RangJoueur];
				Emettre(0, RangJoueur, Sequence, ETypeCommande::CreerEscouade, X, Y, Vitesse);
			}
		}

		const int32 Duree = Iterations < 0 ? 0 : (Iterations > IterationMax ? IterationMax : Iterations);
		for (int32 Iteration = 0; Iteration < Duree; ++Iteration)
		{
			// En moyenne une commande toutes les trois iterations.
			while (Alea.Entre(0, 3) == 0)
			{
				const int32 RangJoueur = Alea.Entre(0, JoueursScenario - 1);
				const int32 Retard = Alea.Entre(0, 5);
				const int32 Cas = Alea.Entre(0, 99);
				const int32 X = TirerCoordonnee();
				const int32 Y = TirerCoordonnee();
				const int32 Vitesse = TirerVitesse();
				// Une fois sur cent, une seconde commande de meme iteration, meme joueur et meme rang : seul son contenu la departage.
				const int32 Jumelle = Alea.Entre(0, 99);
				const int32 X2 = TirerCoordonnee();
				const int32 Y2 = TirerCoordonnee();
				const uint8 Joueur = IdsScenario[RangJoueur];

				// Une escouade : le plus souvent une de celles du joueur, parfois un identifiant quelconque.
				const FEtat& Etat = Enregistreur.LireSimulation().LireEtat();
				const int32 Total = Etat.Escouades.Num();
				int32 IdChoisi = Alea.Entre(1, Etat.ProchainId + 1);
				if (Total > 0 && Cas < 95)
				{
					const int32 Depart = Alea.Entre(0, Total - 1);
					for (int32 Decalage = 0; Decalage < Total; ++Decalage)
					{
						const FEscouade& Candidate = Etat.Escouades[(Depart + Decalage) % Total];
						if (Candidate.Joueur == Joueur)
						{
							IdChoisi = Candidate.Id;
							break;
						}
					}
				}

				const int32 Quand = Iteration + Retard;
				const uint32 Sequence = Sequences[RangJoueur];
				++Sequences[RangJoueur];
				if (Cas < 55)
				{
					Emettre(Quand, RangJoueur, Sequence, ETypeCommande::Deplacer, IdChoisi, X, Y);
				}
				else if (Cas < 70)
				{
					Emettre(Quand, RangJoueur, Sequence, ETypeCommande::Arreter, IdChoisi, 0, 0);
				}
				else if (Cas < 85)
				{
					Emettre(Quand, RangJoueur, Sequence, ETypeCommande::CreerEscouade, X, Y, Vitesse);
				}
				else if (Cas < 95)
				{
					Emettre(Quand, RangJoueur, Sequence, ETypeCommande::Retirer, IdChoisi, 0, 0);
				}
				else
				{
					Emettre(Quand, RangJoueur, Sequence, ETypeCommande::Deplacer, IdChoisi, X, Y);
				}
				if (Jumelle == 0)
				{
					Emettre(Quand, RangJoueur, Sequence, ETypeCommande::Deplacer, IdChoisi, X2, Y2);
				}
			}
			Enregistreur.Avancer();
		}

		return Enregistreur.Extraire();
	}
}
