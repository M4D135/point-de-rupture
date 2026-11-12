#include "PdrSimCommandlet.h"

#include "HAL/FileManager.h"
#include "HAL/PlatformTime.h"
#include "Misc/FileHelper.h"
#include "Misc/Parse.h"
#include "Misc/Paths.h"
#include "PdrAlea.h"
#include "PdrOctets.h"
#include "PdrRelecture.h"
#include "PdrSimulation.h"
#include "PdrTests.h"
#include "PdrTypes.h"

DEFINE_LOG_CATEGORY_STATIC(LogPdrOutils, Log, All);

namespace PdrOutils
{
	namespace
	{
		// Bornes des options. Au-dela, une mesure perd son sens, un nom de fichier change de forme ou un texte ne tient plus en memoire.

		/** Une relecture de cette duree tient largement dans une seule chaine (voir FormaterRelecture). */
		constexpr uint64 IterationsOutilMax = 10000000;
		/** A 150 mm par iteration, les escouades de -boucle mettent plus de 9,4 millions d'iterations a traverser le monde. */
		constexpr uint64 BoucleMax = 9000000;
		/** Le nom des fichiers de parties porte cinq chiffres : au-dela, l'ordre des noms ne serait plus celui des graines. */
		constexpr uint64 PartiesMax = 99999;
		constexpr uint64 ChargeMax = 1000000;
		constexpr uint64 CommandesParIterationMax = 64;
		/** Critere de l'etape A3 : vingt minutes de jeu, soit 24 000 iterations, en six secondes. */
		constexpr double BudgetMicrosecondes = 250.0;

		enum class ELecture : uint8
		{
			Absente,
			Valide,
			Fausse,
		};

		/** Entier decimal sans signe : des chiffres seulement, sans depassement. */
		bool LireChiffres(const FString& Texte, uint64& Valeur)
		{
			if (Texte.IsEmpty() || Texte.Len() > 20)
			{
				return false;
			}
			uint64 Cumul = 0;
			for (int32 Indice = 0; Indice < Texte.Len(); ++Indice)
			{
				const TCHAR Caractere = Texte[Indice];
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

		/**
		 * Lit l'option '-Nom=valeur' : un entier dans [Min, Max]. Une valeur mal ecrite ou hors bornes est une erreur,
		 * jamais une valeur approchee : la meme ligne de commande donne la meme chose sur toute machine.
		 */
		ELecture LireOption(const FString& Params, const TCHAR* Nom, uint64 Min, uint64 Max, uint64& Valeur)
		{
			FString Texte;
			if (!FParse::Value(*Params, *FString::Printf(TEXT("%s="), Nom), Texte))
			{
				return ELecture::Absente;
			}
			uint64 Lue = 0;
			if (!LireChiffres(Texte, Lue) || Lue < Min || Lue > Max)
			{
				UE_LOG(LogPdrOutils, Error, TEXT("PDR_OPTION -%s=%s refusee : entier de %llu a %llu attendu"), Nom, *Texte, Min, Max);
				return ELecture::Fausse;
			}
			Valeur = Lue;
			return ELecture::Valide;
		}

		/** Lit l'option '-Nom=valeur' : seize chiffres hexadecimaux en minuscules, comme les condenses affiches. */
		ELecture LireCondense(const FString& Params, const TCHAR* Nom, uint64& Valeur)
		{
			FString Texte;
			if (!FParse::Value(*Params, *FString::Printf(TEXT("%s="), Nom), Texte))
			{
				return ELecture::Absente;
			}
			uint64 Cumul = 0;
			bool bValide = Texte.Len() == 16;
			for (int32 Indice = 0; bValide && Indice < 16; ++Indice)
			{
				const TCHAR Caractere = Texte[Indice];
				if (Caractere >= TEXT('0') && Caractere <= TEXT('9'))
				{
					Cumul = (Cumul << 4) | static_cast<uint64>(Caractere - TEXT('0'));
				}
				else if (Caractere >= TEXT('a') && Caractere <= TEXT('f'))
				{
					Cumul = (Cumul << 4) | (10 + static_cast<uint64>(Caractere - TEXT('a')));
				}
				else
				{
					bValide = false;
				}
			}
			if (!bValide)
			{
				UE_LOG(LogPdrOutils, Error, TEXT("PDR_OPTION -%s=%s refusee : seize chiffres hexadecimaux en minuscules attendus"), Nom, *Texte);
				return ELecture::Fausse;
			}
			Valeur = Cumul;
			return ELecture::Valide;
		}

		/**
		 * Ajoute une partie au condense : son en-tete, puis des empreintes. A l'enregistrement, celles que la partie vient
		 * de produire ; a la relecture, celles que la simulation a recalculees, jamais celles du fichier. Deux executions
		 * qui affichent le meme condense ont donc calcule les memes etats.
		 */
		void Condenser(Pdr::FEcrivain& Condense, const Pdr::FRelecture& Partie, const TArray<Pdr::FEmpreinteDatee>& Empreintes)
		{
			Condense.U64(Partie.Config.Graine);
			Condense.I32(Partie.Iterations);
			Condense.I32(Partie.Commandes.Num());
			Condense.I32(Empreintes.Num());
			for (const Pdr::FEmpreinteDatee& Releve : Empreintes)
			{
				Condense.I32(Releve.Iteration);
				Condense.U64(Releve.Empreinte);
			}
		}

		/** Vrai si aucun condense n'est attendu, ou si c'est bien celui-la. */
		bool CondenseAttendu(const TCHAR* Action, uint64 Obtenu, bool bAttendu, uint64 Attendu)
		{
			if (!bAttendu || Obtenu == Attendu)
			{
				return true;
			}
			UE_LOG(LogPdrOutils, Error, TEXT("%s condense inattendu : obtenu %016llx, attendu %016llx"), Action, Obtenu, Attendu);
			return false;
		}

		bool LancerTests()
		{
			const double Debut = FPlatformTime::Seconds();
			const Pdr::FResultatTests Resultat = Pdr::ExecuterTests();
			const double DureeMs = (FPlatformTime::Seconds() - Debut) * 1000.0;
			for (const FString& Echec : Resultat.Echecs)
			{
				UE_LOG(LogPdrOutils, Error, TEXT("PDR_TEST_ECHEC %s"), *Echec);
			}
			UE_LOG(LogPdrOutils, Display, TEXT("PDR_TESTS verifications=%d echecs=%d duree_ms=%.1f"),
				Resultat.Verifications, Resultat.NombreEchecs, DureeMs);
			return Resultat.NombreEchecs == 0;
		}

		/**
		 * Mesure la duree d'un nombre d'iterations, avec des escouades qui marchent toutes sans arriver.
		 * Sans escouade, c'est le cout fixe d'une iteration : un compteur, rien de plus.
		 */
		bool MesurerBoucle(int32 Iterations, int32 Escouades)
		{
			Pdr::FSimulation Simulation;
			for (int32 Rang = 0; Rang < Escouades; ++Rang)
			{
				Pdr::FCommande Creation;
				Creation.Iteration = 0;
				Creation.Sequence = static_cast<uint32>(2 * Rang);
				Creation.Type = Pdr::ETypeCommande::CreerEscouade;
				Creation.A = Rang * 1000;
				Creation.B = 0;
				Creation.C = 150;
				Simulation.Soumettre(Creation);

				Pdr::FCommande Marche;
				Marche.Iteration = 0;
				Marche.Sequence = static_cast<uint32>(2 * Rang + 1);
				Marche.Type = Pdr::ETypeCommande::Deplacer;
				Marche.A = Rang + 1;
				Marche.B = Pdr::LimiteMonde;
				Marche.C = Pdr::LimiteMonde;
				Simulation.Soumettre(Marche);
			}
			// La premiere iteration applique les commandes : elle n'est pas mesuree.
			Simulation.Avancer();

			const double Debut = FPlatformTime::Seconds();
			// Iterations ne depasse pas BoucleMax : la somme ne deborde pas et aucune escouade n'arrive.
			Simulation.AvancerJusqua(Simulation.LireEtat().Iteration + Iterations);
			const double DureeMs = (FPlatformTime::Seconds() - Debut) * 1000.0;

			int32 EnMouvement = 0;
			for (const Pdr::FEscouade& Escouade : Simulation.LireEtat().Escouades)
			{
				EnMouvement += Escouade.bEnMouvement ? 1 : 0;
			}
			UE_LOG(LogPdrOutils, Display, TEXT("PDR_BOUCLE iterations=%d escouades=%d en_mouvement=%d duree_ms=%.3f us_par_iteration=%.3f empreinte=%016llx"),
				Iterations, Simulation.LireEtat().Escouades.Num(), EnMouvement, DureeMs, DureeMs * 1000.0 / Iterations, Simulation.Empreinte());
			return Simulation.LireEtat().Iteration == Iterations + 1 && Simulation.LireEtat().Escouades.Num() == Escouades && EnMouvement == Escouades;
		}

		/**
		 * Regime charge : des escouades en marche, des ordres a chaque iteration, et l'enregistreur qui note les commandes
		 * et releve une empreinte toutes les cent iterations. La duree d'une iteration est rapportee au budget.
		 * Le scenario est fixe : meme ligne de commande, meme empreinte finale sur toute machine.
		 */
		bool MesurerCharge(int32 Iterations, int32 Escouades, int32 CommandesParIteration)
		{
			Pdr::FConfigPartie Config;
			Config.Graine = 1;
			Pdr::FEnregistreur Enregistreur(Config);
			uint32 Sequences[3] = { 0, 0, 0 };
			const auto Emettre = [&Enregistreur, &Sequences](int32 Iteration, int32 Joueur, Pdr::ETypeCommande Type, int32 A, int32 B, int32 C) -> bool
			{
				Pdr::FCommande Commande;
				Commande.Iteration = Iteration;
				Commande.Joueur = static_cast<uint8>(Joueur);
				Commande.Sequence = Sequences[Joueur];
				++Sequences[Joueur];
				Commande.Type = Type;
				Commande.A = A;
				Commande.B = B;
				Commande.C = C;
				return Enregistreur.Soumettre(Commande) == Pdr::ESoumission::Acceptee;
			};

			// Trois joueurs se partagent les escouades par tiers. Les commandes d'une iteration s'appliquent joueur apres
			// joueur : avec ce partage, l'escouade de rang R recoit bien l'identifiant R + 1.
			const auto Proprietaire = [Escouades](int32 Rang) -> int32
			{
				return static_cast<int32>(static_cast<int64>(Rang) * 3 / Escouades);
			};

			// Les escouades partent d'une grille et marchent toutes vers le meme coin, a des vitesses differentes.
			bool bAcceptees = true;
			for (int32 Rang = 0; Rang < Escouades; ++Rang)
			{
				const int32 Joueur = Proprietaire(Rang);
				bAcceptees = Emettre(0, Joueur, Pdr::ETypeCommande::CreerEscouade, (Rang % 64) * 3000 - 96000, (Rang / 64) * 3000 - 96000, 100 + Rang % 200) && bAcceptees;
				bAcceptees = Emettre(0, Joueur, Pdr::ETypeCommande::Deplacer, Rang + 1, Pdr::LimiteMonde, Pdr::LimiteMonde) && bAcceptees;
			}
			// La premiere iteration applique l'ouverture : elle n'est pas mesuree.
			Enregistreur.Avancer();

			Pdr::FAlea Alea(2026);
			int64 Ordres = 0;
			const double Debut = FPlatformTime::Seconds();
			for (int32 Tour = 0; Tour < Iterations; ++Tour)
			{
				const int32 Iteration = Enregistreur.LireSimulation().LireEtat().Iteration;
				for (int32 Rang = 0; Rang < CommandesParIteration && Escouades > 0; ++Rang)
				{
					// Chaque tirage a sa propre instruction : leur ordre ne depend pas du compilateur.
					const int32 Visee = Alea.Entre(0, Escouades - 1);
					const int32 X = Alea.Entre(-200000, 200000);
					const int32 Y = Alea.Entre(-200000, 200000);
					// Deux iterations de delai : la file d'attente n'est jamais vide.
					bAcceptees = Emettre(Iteration + 2, Proprietaire(Visee), Pdr::ETypeCommande::Deplacer, Visee + 1, X, Y) && bAcceptees;
					++Ordres;
				}
				Enregistreur.Avancer();
			}
			const double DureeMs = (FPlatformTime::Seconds() - Debut) * 1000.0;

			const Pdr::FEtat& Etat = Enregistreur.LireSimulation().LireEtat();
			int32 EnMouvement = 0;
			for (const Pdr::FEscouade& Escouade : Etat.Escouades)
			{
				EnMouvement += Escouade.bEnMouvement ? 1 : 0;
			}
			const double Microsecondes = DureeMs * 1000.0 / Iterations;
			UE_LOG(LogPdrOutils, Display, TEXT("PDR_CHARGE iterations=%d escouades=%d ordres=%lld appliquees=%u ignorees=%u en_mouvement=%d duree_ms=%.3f us_par_iteration=%.2f budget_pct=%.1f empreinte=%016llx"),
				Iterations, Etat.Escouades.Num(), Ordres, Etat.CommandesAppliquees, Etat.CommandesIgnorees, EnMouvement, DureeMs,
				Microsecondes, Microsecondes * 100.0 / BudgetMicrosecondes, Enregistreur.LireSimulation().Empreinte());
			return bAcceptees && Etat.Iteration == Iterations + 1 && Etat.Escouades.Num() == Escouades && Etat.CommandesIgnorees == 0;
		}

		/**
		 * File longue : des commandes soumises d'avance, une par iteration, puis toutes ces iterations jouees.
		 * Mesure ce que coutent l'insertion dans la file et le retrait en tete, a part du reste.
		 */
		bool MesurerFile(int32 Commandes)
		{
			Pdr::FSimulation Simulation;
			int32 Acceptees = 0;
			const double DebutSoumission = FPlatformTime::Seconds();
			for (int32 Rang = 0; Rang < Commandes; ++Rang)
			{
				// Aucune escouade : chaque ordre sera ignore, et son application ne coute presque rien.
				Pdr::FCommande Ordre;
				Ordre.Iteration = Rang;
				Ordre.Sequence = static_cast<uint32>(Rang);
				Ordre.Type = Pdr::ETypeCommande::Arreter;
				Ordre.A = 1;
				Acceptees += Simulation.Soumettre(Ordre) == Pdr::ESoumission::Acceptee ? 1 : 0;
			}
			const double SoumissionMs = (FPlatformTime::Seconds() - DebutSoumission) * 1000.0;

			const double DebutAvance = FPlatformTime::Seconds();
			Simulation.AvancerJusqua(Commandes);
			const double AvanceMs = (FPlatformTime::Seconds() - DebutAvance) * 1000.0;

			UE_LOG(LogPdrOutils, Display, TEXT("PDR_FILE commandes=%d soumission_ms=%.3f avance_ms=%.3f us_par_iteration=%.3f"),
				Commandes, SoumissionMs, AvanceMs, AvanceMs * 1000.0 / Commandes);
			return Acceptees == Commandes && Simulation.CommandesEnAttente() == 0
				&& Simulation.LireEtat().CommandesIgnorees == static_cast<uint32>(Commandes);
		}

		bool EcrireRelecture(const FString& Chemin, const FString& Texte)
		{
			if (!FFileHelper::SaveStringToFile(Texte, *Chemin, FFileHelper::EEncodingOptions::ForceUTF8WithoutBOM))
			{
				UE_LOG(LogPdrOutils, Error, TEXT("PDR_ECRITURE impossible : %s"), *Chemin);
				return false;
			}
			return true;
		}

		/** Joue des parties distinctes, rejoue chacune dans la foulee, et verifie l'aller-retour par le texte. */
		bool LancerRelectures(int32 Parties, int32 Iterations, const FString& Dossier, bool bAttendu, uint64 Attendu)
		{
			if (!Dossier.IsEmpty() && !IFileManager::Get().MakeDirectory(*Dossier, true))
			{
				UE_LOG(LogPdrOutils, Error, TEXT("PDR_RELECTURES dossier impossible a creer : %s"), *Dossier);
				return false;
			}

			const double Debut = FPlatformTime::Seconds();
			Pdr::FEcrivain Condense;
			TSet<uint64> EmpreintesFinales;
			int32 Conformes = 0;
			int64 Commandes = 0;
			bool bEcritures = true;
			for (int32 Rang = 1; Rang <= Parties; ++Rang)
			{
				const Pdr::FRelecture Partie = Pdr::GenererPartie(static_cast<uint64>(Rang), Iterations);
				const Pdr::FRapportRelecture Rapport = Pdr::Rejouer(Partie);

				const FString Texte = Pdr::FormaterRelecture(Partie);
				Pdr::FRelecture Relue;
				FString Erreur;
				const bool bTexte = Pdr::AnalyserRelecture(Texte, Relue, Erreur) && Pdr::RelecturesEgales(Partie, Relue);

				if (Rapport.bConforme && bTexte)
				{
					++Conformes;
				}
				else
				{
					UE_LOG(LogPdrOutils, Error, TEXT("PDR_RELECTURE_ECHEC graine=%d conforme=%d divergence=%d texte=%d erreur=%s%s"),
						Rang, Rapport.bConforme ? 1 : 0, Rapport.PremiereDivergence, bTexte ? 1 : 0, *Rapport.Erreur, *Erreur);
				}
				if (!Dossier.IsEmpty())
				{
					bEcritures = EcrireRelecture(Dossier / FString::Printf(TEXT("partie-%05d.pdr"), Rang), Texte) && bEcritures;
				}

				Commandes += Partie.Commandes.Num();
				if (Partie.Empreintes.Num() > 0)
				{
					EmpreintesFinales.Add(Partie.Empreintes.Last().Empreinte);
				}
				Condenser(Condense, Partie, Partie.Empreintes);
			}
			const double DureeMs = (FPlatformTime::Seconds() - Debut) * 1000.0;

			const uint64 Obtenu = Pdr::Fnv1a64(Condense.Lire());
			UE_LOG(LogPdrOutils, Display, TEXT("PDR_RELECTURES parties=%d iterations=%d conformes=%d distinctes=%d commandes=%lld condense=%016llx duree_ms=%.1f"),
				Parties, Iterations, Conformes, EmpreintesFinales.Num(), Commandes, Obtenu, DureeMs);
			const bool bCondense = CondenseAttendu(TEXT("PDR_RELECTURES"), Obtenu, bAttendu, Attendu);
			return Conformes == Parties && bEcritures && bCondense;
		}

		bool Enregistrer(const FString& Chemin, uint64 Graine, int32 Iterations)
		{
			const Pdr::FRelecture Partie = Pdr::GenererPartie(Graine, Iterations);
			const bool bEcrit = EcrireRelecture(Chemin, Pdr::FormaterRelecture(Partie));
			UE_LOG(LogPdrOutils, Display, TEXT("PDR_ENREGISTRER graine=%llu iterations=%d commandes=%d empreintes=%d finale=%016llx ecrit=%d"),
				Graine, Partie.Iterations, Partie.Commandes.Num(), Partie.Empreintes.Num(),
				Partie.Empreintes.Num() > 0 ? Partie.Empreintes.Last().Empreinte : 0ull, bEcrit ? 1 : 0);
			return bEcrit;
		}

		/** Rejoue un fichier, ou tous les fichiers .pdr d'un dossier dans l'ordre de leurs noms. */
		bool Relire(const FString& Chemin, bool bAttendu, uint64 Attendu)
		{
			IFileManager& Gestionnaire = IFileManager::Get();
			TArray<FString> Fichiers;
			if (Gestionnaire.DirectoryExists(*Chemin))
			{
				TArray<FString> Noms;
				Gestionnaire.FindFiles(Noms, *(Chemin / TEXT("*.pdr")), true, false);
				// Ordre des caracteres, casse comprise : le meme sur toute machine, et celui des graines pour les fichiers de -relectures.
				Noms.Sort([](const FString& G, const FString& D) { return G.Compare(D, ESearchCase::CaseSensitive) < 0; });
				for (const FString& Nom : Noms)
				{
					Fichiers.Add(Chemin / Nom);
				}
			}
			else
			{
				Fichiers.Add(Chemin);
			}

			const double Debut = FPlatformTime::Seconds();
			Pdr::FEcrivain Condense;
			int32 Conformes = 0;
			for (const FString& Fichier : Fichiers)
			{
				FString Texte;
				Pdr::FRelecture Partie;
				FString Erreur;
				if (!FFileHelper::LoadFileToString(Texte, *Fichier))
				{
					UE_LOG(LogPdrOutils, Error, TEXT("PDR_RELIRE_ECHEC lecture impossible : %s"), *Fichier);
					continue;
				}
				if (!Pdr::AnalyserRelecture(Texte, Partie, Erreur))
				{
					UE_LOG(LogPdrOutils, Error, TEXT("PDR_RELIRE_ECHEC %s : %s"), *Fichier, *Erreur);
					continue;
				}
				const Pdr::FRapportRelecture Rapport = Pdr::Rejouer(Partie);
				if (Rapport.bConforme)
				{
					++Conformes;
				}
				else
				{
					UE_LOG(LogPdrOutils, Error, TEXT("PDR_RELIRE_ECHEC %s : divergence a l'iteration %d, %d empreintes verifiees %s"),
						*Fichier, Rapport.PremiereDivergence, Rapport.EmpreintesVerifiees, *Rapport.Erreur);
				}
				// Les empreintes recalculees ici, pas celles du fichier : le condense depend de ce que cette machine a calcule.
				Condenser(Condense, Partie, Rapport.Recalculees);
			}
			const double DureeMs = (FPlatformTime::Seconds() - Debut) * 1000.0;

			const uint64 Obtenu = Pdr::Fnv1a64(Condense.Lire());
			UE_LOG(LogPdrOutils, Display, TEXT("PDR_RELIRE fichiers=%d conformes=%d condense=%016llx duree_ms=%.1f"),
				Fichiers.Num(), Conformes, Obtenu, DureeMs);
			const bool bCondense = CondenseAttendu(TEXT("PDR_RELIRE"), Obtenu, bAttendu, Attendu);
			return Fichiers.Num() > 0 && Conformes == Fichiers.Num() && bCondense;
		}
	}
}

UPdrSimCommandlet::UPdrSimCommandlet()
{
	IsClient = false;
	IsServer = false;
	IsEditor = true;
	LogToConsole = true;
	// Le code de sortie est celui de Main, sans egard aux erreurs que le moteur a pu journaliser ailleurs.
	UseCommandletResultAsExitCode = true;
}

int32 UPdrSimCommandlet::Main(const FString& Params)
{
	using PdrOutils::ELecture;

	UE_LOG(LogPdrOutils, Display, TEXT("PDR_VERSION format=%d iterations_par_seconde=%d"), Pdr::VersionFormat, Pdr::IterationsParSeconde);

	// Toutes les options sont lues et verifiees avant de rien lancer.
	uint64 Iterations = 10000;
	uint64 Boucle = 0;
	uint64 Escouades = 0;
	uint64 Charge = 0;
	uint64 CommandesParIteration = 8;
	uint64 File = 0;
	uint64 Parties = 0;
	uint64 Graine = 1;
	uint64 Attendu = 0;
	const ELecture LuIterations = PdrOutils::LireOption(Params, TEXT("iterations"), 0, PdrOutils::IterationsOutilMax, Iterations);
	const ELecture LuBoucle = PdrOutils::LireOption(Params, TEXT("boucle"), 1, PdrOutils::BoucleMax, Boucle);
	const ELecture LuEscouades = PdrOutils::LireOption(Params, TEXT("escouades"), 0, static_cast<uint64>(Pdr::EscouadesMax), Escouades);
	const ELecture LuCharge = PdrOutils::LireOption(Params, TEXT("charge"), 1, PdrOutils::ChargeMax, Charge);
	const ELecture LuCommandes = PdrOutils::LireOption(Params, TEXT("commandes"), 0, PdrOutils::CommandesParIterationMax, CommandesParIteration);
	const ELecture LuFile = PdrOutils::LireOption(Params, TEXT("file"), 1, static_cast<uint64>(Pdr::CommandesEnAttenteMax), File);
	const ELecture LuParties = PdrOutils::LireOption(Params, TEXT("relectures"), 1, PdrOutils::PartiesMax, Parties);
	const ELecture LuGraine = PdrOutils::LireOption(Params, TEXT("graine"), 0, MAX_uint64, Graine);
	const ELecture LuAttendu = PdrOutils::LireCondense(Params, TEXT("attendu"), Attendu);
	if (LuIterations == ELecture::Fausse || LuBoucle == ELecture::Fausse || LuEscouades == ELecture::Fausse || LuCharge == ELecture::Fausse
		|| LuCommandes == ELecture::Fausse || LuFile == ELecture::Fausse || LuParties == ELecture::Fausse || LuGraine == ELecture::Fausse
		|| LuAttendu == ELecture::Fausse)
	{
		UE_LOG(LogPdrOutils, Display, TEXT("PDR_RESULTAT ECHEC"));
		return 1;
	}
	const bool bAttendu = LuAttendu == ELecture::Valide;

	bool bDemande = false;
	bool bReussi = true;

	if (FParse::Param(*Params, TEXT("tests")))
	{
		bDemande = true;
		bReussi = PdrOutils::LancerTests() && bReussi;
	}

	if (LuBoucle == ELecture::Valide)
	{
		bDemande = true;
		bReussi = PdrOutils::MesurerBoucle(static_cast<int32>(Boucle), static_cast<int32>(Escouades)) && bReussi;
	}

	if (LuCharge == ELecture::Valide)
	{
		// Sans precision, le regime charge prend l'effectif maximal.
		const int32 Effectif = LuEscouades == ELecture::Valide ? static_cast<int32>(Escouades) : Pdr::EscouadesMax;
		bDemande = true;
		bReussi = PdrOutils::MesurerCharge(static_cast<int32>(Charge), Effectif, static_cast<int32>(CommandesParIteration)) && bReussi;
	}

	if (LuFile == ELecture::Valide)
	{
		bDemande = true;
		bReussi = PdrOutils::MesurerFile(static_cast<int32>(File)) && bReussi;
	}

	if (LuParties == ELecture::Valide)
	{
		FString Dossier;
		FParse::Value(*Params, TEXT("dossier="), Dossier);
		bDemande = true;
		bReussi = PdrOutils::LancerRelectures(static_cast<int32>(Parties), static_cast<int32>(Iterations), Dossier, bAttendu, Attendu) && bReussi;
	}

	FString FichierEnregistre;
	if (FParse::Value(*Params, TEXT("enregistrer="), FichierEnregistre))
	{
		bDemande = true;
		bReussi = PdrOutils::Enregistrer(FichierEnregistre, Graine, static_cast<int32>(Iterations)) && bReussi;
	}

	FString CheminRelu;
	if (FParse::Value(*Params, TEXT("relire="), CheminRelu))
	{
		bDemande = true;
		bReussi = PdrOutils::Relire(CheminRelu, bAttendu, Attendu) && bReussi;
	}

	if (!bDemande)
	{
		UE_LOG(LogPdrOutils, Error, TEXT("PDR_USAGE -tests | -boucle=N [-escouades=N] | -charge=N [-escouades=N] [-commandes=N] | -file=N | -relectures=N [-iterations=N] [-dossier=D] [-attendu=H] | -enregistrer=F [-graine=G] [-iterations=N] | -relire=F [-attendu=H]"));
		return 2;
	}
	UE_LOG(LogPdrOutils, Display, TEXT("PDR_RESULTAT %s"), bReussi ? TEXT("REUSSI") : TEXT("ECHEC"));
	return bReussi ? 0 : 1;
}
