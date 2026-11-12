#include "PdrTests.h"

#include "PdrAlea.h"
#include "PdrCommande.h"
#include "PdrOctets.h"
#include "PdrRelecture.h"
#include "PdrSimulation.h"
#include "PdrTypes.h"

// Tests du noyau de simulation. Ils n'utilisent que son interface publique.
// Les valeurs de reference (empreintes, positions, tirages, octets d'une sauvegarde) viennent d'un modele
// independant ecrit en Python, pas du code teste : Outils/modele/modele_a1.py, commande 'valeurs'.
namespace Pdr
{
	namespace
	{
		constexpr int32 EchecsDetaillesMax = 40;

		constexpr ETypeCommande Creer = ETypeCommande::CreerEscouade;
		constexpr ETypeCommande Deplacer = ETypeCommande::Deplacer;
		constexpr ETypeCommande Arreter = ETypeCommande::Arreter;
		constexpr ETypeCommande Retirer = ETypeCommande::Retirer;

		// Place des champs dans une sauvegarde : graine, puis l'etat, puis les escouades de 26 octets.
		constexpr int32 PlaceVersion = 8;
		constexpr int32 PlaceIteration = 12;
		constexpr int32 PlaceProchainId = 24;
		constexpr int32 PlaceNombreEscouades = 36;
		constexpr int32 PlacePremiereEscouade = 40;
		constexpr int32 PlaceId = PlacePremiereEscouade;
		constexpr int32 PlacePositionX = PlacePremiereEscouade + 5;
		constexpr int32 PlaceVitesse = PlacePremiereEscouade + 21;
		constexpr int32 PlaceMouvement = PlacePremiereEscouade + 25;

		class FBanc
		{
		public:
			explicit FBanc(FResultatTests& InResultat) : Resultat(InResultat) {}

			void Section(const TCHAR* Nom) { NomSection = Nom; }

			void Vrai(bool bCondition, const TCHAR* Quoi)
			{
				++Resultat.Verifications;
				if (!bCondition)
				{
					Noter(FString::Printf(TEXT("%s : %s"), NomSection, Quoi));
				}
			}

			void Egal64(uint64 Obtenu, uint64 Attendu, const TCHAR* Quoi)
			{
				++Resultat.Verifications;
				if (Obtenu != Attendu)
				{
					Noter(FString::Printf(TEXT("%s : %s (obtenu %016llx, attendu %016llx)"), NomSection, Quoi, Obtenu, Attendu));
				}
			}

			void EgalEntier(int64 Obtenu, int64 Attendu, const TCHAR* Quoi)
			{
				++Resultat.Verifications;
				if (Obtenu != Attendu)
				{
					Noter(FString::Printf(TEXT("%s : %s (obtenu %lld, attendu %lld)"), NomSection, Quoi, Obtenu, Attendu));
				}
			}

		private:
			void Noter(const FString& Message)
			{
				++Resultat.NombreEchecs;
				if (Resultat.Echecs.Num() < EchecsDetaillesMax)
				{
					Resultat.Echecs.Add(Message);
				}
			}

			FResultatTests& Resultat;
			const TCHAR* NomSection = TEXT("");
		};

		FCommande Cmd(int32 Iteration, int32 Joueur, uint32 Sequence, ETypeCommande Type, int32 A = 0, int32 B = 0, int32 C = 0)
		{
			FCommande Commande;
			Commande.Iteration = Iteration;
			Commande.Joueur = static_cast<uint8>(Joueur);
			Commande.Sequence = Sequence;
			Commande.Type = Type;
			Commande.A = A;
			Commande.B = B;
			Commande.C = C;
			return Commande;
		}

		/** Vrai si l'escouade de ce rang a cet identifiant, cette position et cet etat de marche. Ne plante pas si elle manque. */
		bool EscouadeEst(const FSimulation& Simulation, int32 Rang, int32 Id, int32 X, int32 Y, bool bEnMouvement)
		{
			const TArray<FEscouade>& Escouades = Simulation.LireEtat().Escouades;
			return Escouades.IsValidIndex(Rang) && Escouades[Rang].Id == Id
				&& Escouades[Rang].Position.X == X && Escouades[Rang].Position.Y == Y
				&& Escouades[Rang].bEnMouvement == bEnMouvement;
		}

		/** Un lot de commandes varie et reproductible : des creations a l'iteration 0, puis de tout jusqu'a DerniereIteration. */
		TArray<FCommande> LotDeCommandes(uint64 Graine, int32 Creations, int32 Autres, int32 DerniereIteration)
		{
			TArray<FCommande> Commandes;
			FAlea Alea(Graine);
			uint32 Sequences[3] = { 0, 0, 0 };
			for (int32 Rang = 0; Rang < Creations; ++Rang)
			{
				const int32 Joueur = Rang % 3;
				const int32 X = Alea.Entre(-50000, 50000);
				const int32 Y = Alea.Entre(-50000, 50000);
				const int32 Vitesse = Alea.Entre(0, 300);
				const uint32 Sequence = Sequences[Joueur];
				++Sequences[Joueur];
				Commandes.Add(Cmd(0, Joueur, Sequence, Creer, X, Y, Vitesse));
			}
			for (int32 Rang = 0; Rang < Autres; ++Rang)
			{
				const int32 Iteration = Alea.Entre(0, DerniereIteration);
				const int32 Joueur = Alea.Entre(0, 2);
				const int32 Id = Alea.Entre(1, Creations + 3);
				const int32 X = Alea.Entre(-50000, 50000);
				const int32 Y = Alea.Entre(-50000, 50000);
				const int32 Cas = Alea.Entre(0, 9);
				const uint32 Sequence = Sequences[Joueur];
				++Sequences[Joueur];
				if (Cas < 6)
				{
					Commandes.Add(Cmd(Iteration, Joueur, Sequence, Deplacer, Id, X, Y));
				}
				else if (Cas < 8)
				{
					Commandes.Add(Cmd(Iteration, Joueur, Sequence, Arreter, Id));
				}
				else if (Cas == 8)
				{
					Commandes.Add(Cmd(Iteration, Joueur, Sequence, Retirer, Id));
				}
				else
				{
					Commandes.Add(Cmd(Iteration, Joueur, Sequence, Creer, X, Y, 120));
				}
			}
			return Commandes;
		}

		void EcrireI32(TArray<uint8>& Octets, int32 Place, int32 Valeur)
		{
			const uint32 Bits = static_cast<uint32>(Valeur);
			for (int32 Rang = 0; Rang < 4; ++Rang)
			{
				if (Octets.IsValidIndex(Place + Rang))
				{
					Octets[Place + Rang] = static_cast<uint8>((Bits >> (8 * Rang)) & 0xFFu);
				}
			}
		}

		bool Acceptee(ESoumission Verdict)
		{
			return Verdict == ESoumission::Acceptee;
		}

		bool Charger(FSimulation& Simulation, const TArray<uint8>& Octets)
		{
			FLecteur Lecteur(Octets);
			return Simulation.Deserialiser(Lecteur);
		}

		bool SeCharge(const TArray<uint8>& Octets)
		{
			FSimulation Essai;
			return Charger(Essai, Octets);
		}

		struct FEscouadeEcrite
		{
			int32 Id = 1;
			uint8 Joueur = 0;
			int32 X = 0;
			int32 Y = 0;
			int32 CibleX = 0;
			int32 CibleY = 0;
			int32 Vitesse = 0;
			uint8 Mouvement = 0;
		};

		/** Une sauvegarde ecrite a la main, champ par champ, sans passer par la simulation : elle peut etre fausse a dessein. */
		struct FSauvegardeEcrite
		{
			uint64 Graine = 0;
			int32 Iteration = 0;
			uint64 Alea = 0;
			int32 ProchainId = 1;
			uint32 Appliquees = 0;
			uint32 Ignorees = 0;
			TArray<FEscouadeEcrite> Escouades;
			TArray<FCommande> Commandes;

			TArray<uint8> Octets() const
			{
				FEcrivain Ecrivain;
				Ecrivain.U64(Graine);
				Ecrivain.I32(VersionFormat);
				Ecrivain.I32(Iteration);
				Ecrivain.U64(Alea);
				Ecrivain.I32(ProchainId);
				Ecrivain.U32(Appliquees);
				Ecrivain.U32(Ignorees);
				Ecrivain.I32(Escouades.Num());
				for (const FEscouadeEcrite& Escouade : Escouades)
				{
					Ecrivain.I32(Escouade.Id);
					Ecrivain.U8(Escouade.Joueur);
					Ecrivain.I32(Escouade.X);
					Ecrivain.I32(Escouade.Y);
					Ecrivain.I32(Escouade.CibleX);
					Ecrivain.I32(Escouade.CibleY);
					Ecrivain.I32(Escouade.Vitesse);
					Ecrivain.U8(Escouade.Mouvement);
				}
				Ecrivain.I32(Commandes.Num());
				for (const FCommande& Commande : Commandes)
				{
					Ecrivain.I32(Commande.Iteration);
					Ecrivain.U8(Commande.Joueur);
					Ecrivain.U32(Commande.Sequence);
					Ecrivain.U8(static_cast<uint8>(Commande.Type));
					Ecrivain.I32(Commande.A);
					Ecrivain.I32(Commande.B);
					Ecrivain.I32(Commande.C);
				}
				return Ecrivain.Lire();
			}
		};

		/** Une sauvegarde ecrite a la main : aucune commande en attente, et une escouade si bAvecEscouade. */
		TArray<uint8> SauvegardeALaMain(int32 Iteration, bool bAvecEscouade, int32 X, int32 Y, int32 CibleX, int32 CibleY, int32 Vitesse, uint8 Mouvement)
		{
			FSauvegardeEcrite Sauvegarde;
			Sauvegarde.Iteration = Iteration;
			if (bAvecEscouade)
			{
				Sauvegarde.ProchainId = 2;
				Sauvegarde.Appliquees = 1;
				FEscouadeEcrite Escouade;
				Escouade.X = X;
				Escouade.Y = Y;
				Escouade.CibleX = CibleX;
				Escouade.CibleY = CibleY;
				Escouade.Vitesse = Vitesse;
				Escouade.Mouvement = Mouvement;
				Sauvegarde.Escouades.Add(Escouade);
			}
			return Sauvegarde.Octets();
		}

		/** Empreinte du texte d'une relecture, octet par octet : le texte ne contient que de l'ASCII. */
		uint64 EmpreinteDuTexte(const FString& Texte)
		{
			TArray<uint8> Octets;
			Octets.Reserve(Texte.Len());
			for (int32 Indice = 0; Indice < Texte.Len(); ++Indice)
			{
				Octets.Add(static_cast<uint8>(Texte[Indice]));
			}
			return Fnv1a64(Octets);
		}

		/** Rejoue une partie depuis ses commandes et condense l'empreinte de l'etat apres 0, 1, ..., N iterations. */
		uint64 EmpreintesDeChaqueIteration(const FRelecture& Partie)
		{
			FSimulation Simulation(Partie.Config);
			FEcrivain Suite;
			Suite.U64(Simulation.Empreinte());
			int32 Suivante = 0;
			for (int32 Iteration = 0; Iteration < Partie.Iterations; ++Iteration)
			{
				while (Suivante < Partie.Commandes.Num() && Partie.Commandes[Suivante].Iteration == Iteration)
				{
					Simulation.Soumettre(Partie.Commandes[Suivante]);
					++Suivante;
				}
				Simulation.Avancer();
				Suite.U64(Simulation.Empreinte());
			}
			return Fnv1a64(Suite.Lire());
		}

		void TesterAlea(FBanc& Banc)
		{
			Banc.Section(TEXT("alea"));

			FAlea Zero(0);
			Banc.Egal64(Zero.Suivant64(), 0xE220A8397B1DCDAFull, TEXT("graine 0, premier tirage"));
			Banc.Egal64(Zero.Suivant64(), 0x6E789E6AA1B965F4ull, TEXT("graine 0, deuxieme tirage"));
			Banc.Egal64(Zero.Suivant64(), 0x06C45D188009454Full, TEXT("graine 0, troisieme tirage"));

			FAlea QuaranteDeux(42);
			Banc.Egal64(QuaranteDeux.Suivant64(), 0xBDD732262FEB6E95ull, TEXT("graine 42, premier tirage"));

			FAlea Cent(0);
			Banc.EgalEntier(Cent.Entre(0, 99), 35, TEXT("graine 0, premier tirage entre 0 et 99"));
			Banc.EgalEntier(Cent.Entre(0, 99), 0, TEXT("graine 0, deuxieme tirage entre 0 et 99"));
			Banc.EgalEntier(Cent.Entre(0, 99), 79, TEXT("graine 0, troisieme tirage entre 0 et 99"));

			FAlea Sept(7);
			const int32 Attendus[5] = { -1, 0, -3, 0, 2 };
			for (int32 Rang = 0; Rang < 5; ++Rang)
			{
				Banc.EgalEntier(Sept.Entre(-3, 3), Attendus[Rang], TEXT("graine 7, tirages entre -3 et 3"));
			}

			FAlea Source(123);
			Source.Suivant64();
			FAlea Reprise(0);
			Reprise.EcrireEtat(Source.LireEtat());
			const uint64 SuiteSource = Source.Suivant64();
			const uint64 SuiteReprise = Reprise.Suivant64();
			Banc.Egal64(SuiteReprise, SuiteSource, TEXT("reprise de la suite par l'etat"));

			FAlea Bornes(2026);
			bool bDansLesBornes = true;
			bool bMinVu = false;
			bool bMaxVu = false;
			for (int32 Rang = 0; Rang < 10000; ++Rang)
			{
				const int32 Valeur = Bornes.Entre(-3, 3);
				bDansLesBornes = bDansLesBornes && Valeur >= -3 && Valeur <= 3;
				bMinVu = bMinVu || Valeur == -3;
				bMaxVu = bMaxVu || Valeur == 3;
			}
			Banc.Vrai(bDansLesBornes, TEXT("tirages toujours dans les bornes"));
			Banc.Vrai(bMinVu && bMaxVu, TEXT("les deux bornes sont atteintes"));

			const uint64 Avant = Bornes.LireEtat();
			Banc.EgalEntier(Bornes.Entre(5, 5), 5, TEXT("etendue nulle : rend la borne"));
			Banc.EgalEntier(Bornes.Entre(9, 2), 9, TEXT("etendue inversee : rend la premiere borne"));
			Banc.Egal64(Bornes.LireEtat(), Avant, TEXT("etendue nulle ou inversee : aucun tirage consomme"));

			bool bExtremes = true;
			for (int32 Rang = 0; Rang < 1000; ++Rang)
			{
				const int32 Haut = Bornes.Entre(MAX_int32 - 1, MAX_int32);
				const int32 Bas = Bornes.Entre(MIN_int32, MIN_int32 + 1);
				bExtremes = bExtremes && Haut >= MAX_int32 - 1 && Bas <= MIN_int32 + 1;
			}
			Banc.Vrai(bExtremes, TEXT("bornes extremes sans depassement"));

			FAlea Etendue(0);
			Banc.EgalEntier(Etendue.Entre(MIN_int32, MAX_int32), -81932881, TEXT("graine 0, tirage sur toute l'etendue des entiers"));
		}

		void TesterOctets(FBanc& Banc)
		{
			Banc.Section(TEXT("octets"));

			FEcrivain Ecrivain;
			Ecrivain.U8(0xAB);
			Ecrivain.U32(0x01020304u);
			Ecrivain.I32(-2);
			Ecrivain.U64(0x0102030405060708ull);
			const TArray<uint8>& Octets = Ecrivain.Lire();
			const uint8 Attendus[17] = { 0xAB, 0x04, 0x03, 0x02, 0x01, 0xFE, 0xFF, 0xFF, 0xFF, 0x08, 0x07, 0x06, 0x05, 0x04, 0x03, 0x02, 0x01 };
			Banc.EgalEntier(Octets.Num(), 17, TEXT("taille ecrite"));
			bool bOctets = Octets.Num() == 17;
			for (int32 Rang = 0; bOctets && Rang < 17; ++Rang)
			{
				bOctets = Octets[Rang] == Attendus[Rang];
			}
			Banc.Vrai(bOctets, TEXT("octet de poids faible en premier"));

			FLecteur Lecteur(Octets);
			Banc.EgalEntier(Lecteur.U8(), 0xAB, TEXT("relecture d'un octet"));
			Banc.Egal64(Lecteur.U32(), 0x01020304u, TEXT("relecture de 32 bits"));
			Banc.EgalEntier(Lecteur.I32(), -2, TEXT("relecture d'un entier negatif"));
			Banc.Egal64(Lecteur.U64(), 0x0102030405060708ull, TEXT("relecture de 64 bits"));
			Banc.Vrai(Lecteur.Ok() && Lecteur.Fini(), TEXT("tampon lu en entier"));
			Lecteur.U8();
			Banc.Vrai(!Lecteur.Ok() && !Lecteur.Fini(), TEXT("lecture au-dela de la fin signalee"));

			FLecteur Court(Octets.GetData(), 3);
			Court.U8();
			Court.U32();
			Banc.Vrai(!Court.Ok(), TEXT("entier coupe par la fin du tampon signale"));

			FLecteur Negatif(Octets.GetData(), -5);
			Banc.Vrai(Negatif.Fini(), TEXT("taille negative : tampon vide"));
			Banc.EgalEntier(Negatif.U8(), 0, TEXT("tampon vide : la lecture rend zero"));
			Banc.Vrai(!Negatif.Ok(), TEXT("tampon vide : lecture signalee"));
		}

		void TesterEmpreinteEtRacine(FBanc& Banc)
		{
			Banc.Section(TEXT("fnv"));
			Banc.Egal64(Fnv1a64(nullptr, 0), 0xcbf29ce484222325ull, TEXT("tampon vide"));
			const uint8 LettreA[1] = { 0x61 };
			Banc.Egal64(Fnv1a64(LettreA, 1), 0xaf63dc4c8601ec8cull, TEXT("un octet"));
			const uint8 TroisLettres[3] = { 0x70, 0x64, 0x72 };
			Banc.Egal64(Fnv1a64(TroisLettres, 3), 0x77c05c19566e5259ull, TEXT("trois octets"));

			Banc.Section(TEXT("racine"));
			const int64 Valeurs[12] = { 0, 1, 2, 3, 4, 15, 16, 17, 1000000000000ll, 999999999999ll, 8000000000000000000ll, MAX_int64 };
			const int64 Racines[12] = { 0, 1, 1, 1, 2, 3, 4, 4, 1000000ll, 999999ll, 2828427124ll, 3037000499ll };
			for (int32 Rang = 0; Rang < 12; ++Rang)
			{
				Banc.EgalEntier(RacineEntiere(Valeurs[Rang]), Racines[Rang], TEXT("valeur de reference"));
			}
			Banc.EgalEntier(RacineEntiere(-5), 0, TEXT("valeur negative"));
			Banc.EgalEntier(RacineEntiere(MIN_int64), 0, TEXT("plus petite valeur"));

			// Aux abords des grands carres parfaits, une racine calculee en flottant se trompe d'une unite.
			const int64 Cotes[5] = { 67108865ll, 94906267ll, 2147483649ll, 2828427125ll, 3037000499ll };
			for (int32 Rang = 0; Rang < 5; ++Rang)
			{
				const int64 Cote = Cotes[Rang];
				Banc.EgalEntier(RacineEntiere(Cote * Cote - 1), Cote - 1, TEXT("juste avant un grand carre parfait"));
				Banc.EgalEntier(RacineEntiere(Cote * Cote), Cote, TEXT("grand carre parfait"));
			}
			Banc.EgalEntier(RacineEntiere(999610257982111970ll), 999805109ll, TEXT("valeur rencontree en partie, fausse en flottant"));

			FAlea Alea(64);
			bool bEncadre = true;
			for (int32 Rang = 0; Rang < 5000; ++Rang)
			{
				const int32 Decalage = Alea.Entre(1, 62);
				const uint64 Tirage = Alea.Suivant64() >> Decalage;
				const uint64 Racine = static_cast<uint64>(RacineEntiere(static_cast<int64>(Tirage)));
				bEncadre = bEncadre && Racine * Racine <= Tirage && (Racine + 1) * (Racine + 1) > Tirage;
			}
			Banc.Vrai(bEncadre, TEXT("la racine encadre la valeur, sur 5 000 tirages"));
		}

		void TesterDeplacement(FBanc& Banc)
		{
			Banc.Section(TEXT("deplacement"));

			// Triangle 3-4-5 : 5 000 mm a 150 mm par iteration, soit 90 et 120 par axe, et 34 iterations.
			{
				FSimulation Simulation;
				Simulation.Soumettre(Cmd(0, 0, 0, Creer, 0, 0, 150));
				Simulation.Soumettre(Cmd(0, 0, 1, Deplacer, 1, 3000, 4000));
				Simulation.Avancer();
				Banc.Vrai(EscouadeEst(Simulation, 0, 1, 90, 120, true), TEXT("3-4-5 : premier pas"));
				Simulation.AvancerJusqua(33);
				Banc.Vrai(EscouadeEst(Simulation, 0, 1, 2970, 3960, true), TEXT("3-4-5 : avant-dernier pas"));
				Simulation.Avancer();
				Banc.Vrai(EscouadeEst(Simulation, 0, 1, 3000, 4000, false), TEXT("3-4-5 : arrivee exacte et arret"));
			}

			// Sens negatif : la troncature se fait vers zero, comme dans le sens positif.
			{
				FSimulation Simulation;
				Simulation.Soumettre(Cmd(0, 0, 0, Creer, 0, 0, 150));
				Simulation.Soumettre(Cmd(0, 0, 1, Deplacer, 1, -3000, -4000));
				Simulation.Avancer();
				Banc.Vrai(EscouadeEst(Simulation, 0, 1, -90, -120, true), TEXT("sens negatif : premier pas"));
			}
			{
				FSimulation Simulation;
				Simulation.Soumettre(Cmd(0, 0, 0, Creer, 0, 0, 7));
				Simulation.Soumettre(Cmd(0, 0, 1, Deplacer, 1, -100, 33));
				Simulation.AvancerJusqua(3);
				Banc.Vrai(EscouadeEst(Simulation, 0, 1, -18, 6, true), TEXT("troncature vers zero sur les deux axes"));
			}

			// 1 mm par iteration, en biais : le pas calcule est nul, l'escouade doit avancer quand meme.
			{
				FSimulation Simulation;
				Simulation.Soumettre(Cmd(0, 0, 0, Creer, 0, 0, 1));
				Simulation.Soumettre(Cmd(0, 0, 1, Deplacer, 1, 5, 5));
				Simulation.AvancerJusqua(7);
				const bool bEncoreEnRoute = Simulation.LireEtat().Escouades.Num() == 1 && Simulation.LireEtat().Escouades[0].bEnMouvement;
				Banc.Vrai(bEncoreEnRoute, TEXT("vitesse 1 en biais : encore en route a l'iteration 7"));
				Simulation.Avancer();
				Banc.Vrai(EscouadeEst(Simulation, 0, 1, 5, 5, false), TEXT("vitesse 1 en biais : arrivee a l'iteration 8"));
			}

			// D'un coin du monde a l'autre, a la vitesse maximale : aucun depassement de capacite.
			{
				FSimulation Simulation;
				Simulation.Soumettre(Cmd(0, 0, 0, Creer, -LimiteMonde, -LimiteMonde, VitesseMax));
				Simulation.Soumettre(Cmd(0, 0, 1, Deplacer, 1, LimiteMonde, LimiteMonde));
				Simulation.Avancer();
				Banc.Vrai(EscouadeEst(Simulation, 0, 1, -999929290, -999929290, true), TEXT("diagonale du monde : premier pas"));
			}

			// Valeurs hors limites ramenees aux bornes.
			{
				FSimulation Simulation;
				Simulation.Soumettre(Cmd(0, 0, 0, Creer, MAX_int32, MIN_int32, MAX_int32));
				Simulation.Soumettre(Cmd(0, 0, 1, Creer, 0, 0, -5));
				Simulation.Soumettre(Cmd(0, 0, 2, Deplacer, 2, MIN_int32, MAX_int32));
				Simulation.Avancer();
				const TArray<FEscouade>& Escouades = Simulation.LireEtat().Escouades;
				Banc.Vrai(EscouadeEst(Simulation, 0, 1, LimiteMonde, -LimiteMonde, false), TEXT("position ramenee dans le monde"));
				Banc.Vrai(Escouades.Num() == 2 && Escouades[0].Vitesse == VitesseMax, TEXT("vitesse ramenee au maximum"));
				Banc.Vrai(Escouades.Num() == 2 && Escouades[1].Vitesse == 0, TEXT("vitesse negative ramenee a zero"));
				Banc.Vrai(Escouades.Num() == 2 && Escouades[1].Cible.X == -LimiteMonde && Escouades[1].Cible.Y == LimiteMonde,
					TEXT("cible ramenee dans le monde"));
				Banc.Vrai(EscouadeEst(Simulation, 1, 2, 0, 0, false), TEXT("vitesse nulle : l'escouade ne part pas"));
				Simulation.AvancerJusqua(10);
				Banc.Vrai(EscouadeEst(Simulation, 1, 2, 0, 0, false), TEXT("vitesse nulle : l'escouade ne bouge pas"));
			}

			// Les memes bornes de l'autre cote de chaque axe, puis a un millimetre hors du monde.
			{
				FSimulation Simulation;
				Simulation.Soumettre(Cmd(0, 0, 0, Creer, MIN_int32, MAX_int32, 0));
				Simulation.Soumettre(Cmd(0, 0, 1, Deplacer, 1, MAX_int32, MIN_int32));
				Simulation.Soumettre(Cmd(0, 0, 2, Creer, LimiteMonde + 1, -LimiteMonde - 1, VitesseMax + 1));
				Simulation.Soumettre(Cmd(0, 0, 3, Creer, -LimiteMonde - 1, LimiteMonde + 1, 0));
				Simulation.Soumettre(Cmd(0, 0, 4, Deplacer, 3, LimiteMonde + 1, -LimiteMonde - 1));
				Simulation.Avancer();
				const TArray<FEscouade>& Escouades = Simulation.LireEtat().Escouades;
				Banc.Vrai(EscouadeEst(Simulation, 0, 1, -LimiteMonde, LimiteMonde, false), TEXT("position ramenee dans le monde, cotes opposes"));
				Banc.Vrai(Escouades.Num() == 3 && Escouades[0].Cible.X == LimiteMonde && Escouades[0].Cible.Y == -LimiteMonde,
					TEXT("cible ramenee dans le monde, cotes opposes"));
				Banc.Vrai(EscouadeEst(Simulation, 1, 2, LimiteMonde, -LimiteMonde, false) && Escouades.Num() == 3 && Escouades[1].Vitesse == VitesseMax,
					TEXT("un millimetre hors du monde et un de trop en vitesse : ramenes aux bornes"));
				Banc.Vrai(EscouadeEst(Simulation, 2, 3, -LimiteMonde, LimiteMonde, false)
					&& Escouades.Num() == 3 && Escouades[2].Cible.X == LimiteMonde && Escouades[2].Cible.Y == -LimiteMonde,
					TEXT("un millimetre hors du monde, cotes opposes, position et cible"));
			}

			// Cible egale a la position : pas de mouvement.
			{
				FSimulation Simulation;
				Simulation.Soumettre(Cmd(0, 0, 0, Creer, 40, 50, 10));
				Simulation.Soumettre(Cmd(0, 0, 1, Deplacer, 1, 40, 50));
				Simulation.Avancer();
				Banc.Vrai(EscouadeEst(Simulation, 0, 1, 40, 50, false), TEXT("cible sur place : pas de mouvement"));
			}

			// Sur 200 trajets tires au sort : la distance a la cible diminue a chaque iteration, et l'escouade arrive.
			{
				FAlea Alea(31);
				bool bDecroit = true;
				bool bArrive = true;
				bool bDansLesTemps = true;
				for (int32 Essai = 0; Essai < 200; ++Essai)
				{
					const int32 X0 = Alea.Entre(-5000, 5000);
					const int32 Y0 = Alea.Entre(-5000, 5000);
					const int32 X1 = Alea.Entre(-5000, 5000);
					const int32 Y1 = Alea.Entre(-5000, 5000);
					const int32 Vitesse = Alea.Entre(1, 60);
					FSimulation Simulation;
					Simulation.Soumettre(Cmd(0, 0, 0, Creer, X0, Y0, Vitesse));
					Simulation.Soumettre(Cmd(0, 0, 1, Deplacer, 1, X1, Y1));

					const int64 EcartX = static_cast<int64>(X1) - X0;
					const int64 EcartY = static_cast<int64>(Y1) - Y0;
					// Chaque iteration rapproche d'au moins un millimetre sur un axe.
					const int64 Limite = (EcartX < 0 ? -EcartX : EcartX) + (EcartY < 0 ? -EcartY : EcartY) + 1;
					int64 Precedent = EcartX * EcartX + EcartY * EcartY;
					const int64 Distance = RacineEntiere(Precedent);
					bool bArrivee = false;
					int64 Tours = 0;
					for (int64 Tour = 0; Tour < Limite && !bArrivee; ++Tour)
					{
						Simulation.Avancer();
						++Tours;
						if (Simulation.LireEtat().Escouades.Num() != 1)
						{
							break;
						}
						const FEscouade& Escouade = Simulation.LireEtat().Escouades[0];
						const int64 ResteX = static_cast<int64>(X1) - Escouade.Position.X;
						const int64 ResteY = static_cast<int64>(Y1) - Escouade.Position.Y;
						const int64 Carre = ResteX * ResteX + ResteY * ResteY;
						if (Precedent != 0 && Carre >= Precedent)
						{
							bDecroit = false;
						}
						Precedent = Carre;
						bArrivee = !Escouade.bEnMouvement && Carre == 0;
					}
					bArrive = bArrive && bArrivee;
					// Le pas est tronque sur chaque axe : une iteration rapproche quand meme de plus de (vitesse - 2) millimetres.
					if (Vitesse >= 3)
					{
						bDansLesTemps = bDansLesTemps && Tours <= Distance / (Vitesse - 2) + 2;
					}
				}
				Banc.Vrai(bDecroit, TEXT("la distance a la cible diminue a chaque iteration"));
				Banc.Vrai(bArrive, TEXT("toute escouade arrive exactement sur sa cible"));
				Banc.Vrai(bDansLesTemps, TEXT("la troncature du pas ne coute jamais plus de 2 mm par iteration"));
			}
		}

		void TesterCommandes(FBanc& Banc)
		{
			Banc.Section(TEXT("commandes"));

			FSimulation Simulation;
			Banc.Vrai(Simulation.Soumettre(Cmd(0, 0, 0, ETypeCommande::Aucune)) == ESoumission::Invalide, TEXT("type Aucune : invalide"));
			Banc.Vrai(Simulation.Soumettre(Cmd(0, 0, 0, static_cast<ETypeCommande>(5))) == ESoumission::Invalide, TEXT("premier type inconnu : invalide"));
			Banc.Vrai(Simulation.Soumettre(Cmd(0, 0, 0, static_cast<ETypeCommande>(255))) == ESoumission::Invalide, TEXT("dernier type inconnu : invalide"));
			Banc.Vrai(Simulation.Soumettre(Cmd(-1, 0, 0, Creer)) == ESoumission::Invalide, TEXT("iteration negative : invalide"));
			Banc.Vrai(Simulation.Soumettre(Cmd(MIN_int32, 0, 0, Creer)) == ESoumission::Invalide, TEXT("plus petite iteration : invalide"));
			Banc.Vrai(Simulation.Soumettre(Cmd(IterationMax, 0, 0, Creer)) == ESoumission::Invalide, TEXT("iteration hors limite : invalide"));
			Banc.EgalEntier(Simulation.CommandesEnAttente(), 0, TEXT("une commande refusee n'est pas mise en attente"));
			Banc.EgalEntier(Simulation.SequenceLibre(0), 0, TEXT("rang libre : zero quand rien n'attend"));

			Banc.Vrai(Acceptee(Simulation.Soumettre(Cmd(0, 0, 0, Creer, 100, 200, 50))), TEXT("creation acceptee"));
			Banc.Vrai(Acceptee(Simulation.Soumettre(Cmd(0, 1, 0, Creer, -100, -200, 50))), TEXT("creation de l'autre joueur acceptee"));
			Banc.Vrai(Acceptee(Simulation.Soumettre(Cmd(3, 0, 1, Deplacer, 1, 1000, 200))), TEXT("commande future acceptee"));
			Banc.Vrai(Acceptee(Simulation.Soumettre(Cmd(IterationMax - 1, 7, 4000000000u, Arreter, 1))), TEXT("commande pour la derniere iteration jouable acceptee"));
			Banc.EgalEntier(Simulation.CommandesEnAttente(), 4, TEXT("quatre commandes en attente"));
			Banc.EgalEntier(Simulation.SequenceLibre(0), 2, TEXT("rang libre : apres le plus grand rang en attente du joueur"));
			Banc.EgalEntier(Simulation.SequenceLibre(1), 1, TEXT("rang libre : propre a chaque joueur"));
			Banc.EgalEntier(Simulation.SequenceLibre(7), 4000000001u, TEXT("rang libre : sans signe"));
			Banc.EgalEntier(Simulation.SequenceLibre(2), 0, TEXT("rang libre : zero pour un joueur sans commande"));

			Simulation.Avancer();
			Banc.EgalEntier(Simulation.LireEtat().Iteration, 1, TEXT("une iteration jouee"));
			Banc.EgalEntier(Simulation.CommandesEnAttente(), 2, TEXT("les commandes futures attendent encore"));
			Banc.EgalEntier(Simulation.LireEtat().Escouades.Num(), 2, TEXT("deux escouades creees"));
			Banc.EgalEntier(Simulation.LireEtat().ProchainId, 3, TEXT("prochain identifiant"));
			Banc.EgalEntier(Simulation.LireEtat().CommandesAppliquees, 2, TEXT("deux commandes appliquees"));
			Banc.Vrai(Simulation.Soumettre(Cmd(0, 0, 9, Creer)) == ESoumission::Tardive, TEXT("commande pour une iteration deja jouee : tardive"));
			Banc.Vrai(Simulation.Soumettre(Cmd(0, 0, 9, ETypeCommande::Aucune)) == ESoumission::Invalide, TEXT("tardive et invalide a la fois : dite invalide"));
			Banc.EgalEntier(Simulation.SequenceLibre(1), 0, TEXT("rang libre : une commande deja appliquee ne compte plus"));

			Simulation.AvancerJusqua(3);
			Banc.Vrai(EscouadeEst(Simulation, 0, 1, 100, 200, false), TEXT("la commande future n'agit pas avant son iteration"));
			Simulation.Avancer();
			Banc.Vrai(EscouadeEst(Simulation, 0, 1, 150, 200, true), TEXT("la commande future agit a son iteration"));

			// Escouade d'un autre joueur, puis escouade inconnue : tout est ignore.
			Simulation.Soumettre(Cmd(4, 1, 1, Arreter, 1));
			Simulation.Soumettre(Cmd(4, 1, 2, Retirer, 1));
			Simulation.Soumettre(Cmd(4, 1, 3, Deplacer, 1, 0, 0));
			Simulation.Soumettre(Cmd(4, 0, 2, Deplacer, 77, 0, 0));
			Simulation.Soumettre(Cmd(4, 0, 3, Arreter, 0));
			Simulation.Soumettre(Cmd(4, 0, 4, Retirer, -5));
			Simulation.Avancer();
			Banc.EgalEntier(Simulation.LireEtat().CommandesIgnorees, 6, TEXT("six commandes ignorees"));
			Banc.Vrai(EscouadeEst(Simulation, 0, 1, 200, 200, true), TEXT("l'escouade visee a tort continue sa route"));

			Simulation.Soumettre(Cmd(5, 0, 5, Arreter, 1));
			Simulation.Avancer();
			Banc.Vrai(EscouadeEst(Simulation, 0, 1, 200, 200, false), TEXT("arret : l'escouade ne fait pas un pas de plus"));
			const bool bCibleSurPlace = Simulation.LireEtat().Escouades.Num() == 2
				&& Simulation.LireEtat().Escouades[0].Cible == Simulation.LireEtat().Escouades[0].Position;
			Banc.Vrai(bCibleSurPlace, TEXT("arret : la cible devient la position"));

			Simulation.Soumettre(Cmd(6, 1, 4, Retirer, 2));
			Simulation.Soumettre(Cmd(6, 1, 5, Creer, 5, 5, 5));
			Simulation.Avancer();
			Banc.EgalEntier(Simulation.LireEtat().Escouades.Num(), 2, TEXT("une escouade retiree, une creee"));
			Banc.Vrai(EscouadeEst(Simulation, 1, 3, 5, 5, false), TEXT("un identifiant retire ne resert pas"));
			Banc.EgalEntier(Simulation.LireEtat().ProchainId, 4, TEXT("prochain identifiant apres retrait"));
			Banc.EgalEntier(Simulation.LireEtat().CommandesAppliquees, 6, TEXT("six commandes appliquees"));
			Banc.EgalEntier(Simulation.LireEtat().CommandesIgnorees, 6, TEXT("toujours six commandes ignorees"));
			Banc.EgalEntier(Simulation.CommandesEnAttente(), 1, TEXT("seule la commande de la derniere iteration attend encore"));
		}

		void TesterLimites(FBanc& Banc)
		{
			Banc.Section(TEXT("limites"));

			// Une escouade de trop.
			{
				FSimulation Pleine;
				for (int32 Rang = 0; Rang <= EscouadesMax; ++Rang)
				{
					Pleine.Soumettre(Cmd(0, 0, static_cast<uint32>(Rang), Creer, Rang, 0, 0));
				}
				Pleine.Avancer();
				Banc.EgalEntier(Pleine.LireEtat().Escouades.Num(), EscouadesMax, TEXT("nombre d'escouades plafonne"));
				Banc.EgalEntier(Pleine.LireEtat().CommandesIgnorees, 1, TEXT("la creation de trop est ignoree"));
			}

			// File d'attente au plafond. Le refus depend alors de l'ordre d'arrivee : deux simulations qui recoivent
			// les memes commandes dans un ordre different n'en gardent pas les memes. D'ou l'avertissement de Soumettre.
			{
				const FCommande CreationX = Cmd(5, 0, 0, Creer, 0, 0, 0);
				const FCommande CreationY = Cmd(5, 0, 1, Creer, 100, 100, 0);
				FSimulation Premiere;
				FSimulation Seconde;
				bool bAcceptees = Acceptee(Premiere.Soumettre(CreationX)) && Acceptee(Seconde.Soumettre(CreationY));
				for (int32 Rang = 0; Rang < CommandesEnAttenteMax - 1; ++Rang)
				{
					// Le joueur 1 vise une escouade du joueur 0 : commandes ignorees, qui ne font que remplir la file.
					const FCommande Remplissage = Cmd(5, 1, static_cast<uint32>(Rang), Arreter, 1);
					bAcceptees = Acceptee(Premiere.Soumettre(Remplissage)) && bAcceptees;
					bAcceptees = Acceptee(Seconde.Soumettre(Remplissage)) && bAcceptees;
				}
				Banc.Vrai(bAcceptees, TEXT("file d'attente remplie jusqu'au plafond"));
				Banc.EgalEntier(Premiere.CommandesEnAttente(), CommandesEnAttenteMax, TEXT("file d'attente au plafond"));
				Banc.Vrai(Premiere.Soumettre(CreationY) == ESoumission::FilePleine, TEXT("file pleine : commande refusee, motif donne"));
				Banc.Vrai(Seconde.Soumettre(CreationX) == ESoumission::FilePleine, TEXT("file pleine : l'autre simulation refuse l'autre commande"));
				Banc.Vrai(Premiere.Soumettre(Cmd(5, 0, 2, ETypeCommande::Aucune)) == ESoumission::Invalide, TEXT("file pleine : une commande invalide reste dite invalide"));
				Banc.EgalEntier(Premiere.CommandesEnAttente(), CommandesEnAttenteMax, TEXT("file pleine : rien n'est ajoute"));
				Premiere.AvancerJusqua(6);
				Seconde.AvancerJusqua(6);
				Banc.EgalEntier(Premiere.CommandesEnAttente(), 0, TEXT("file videe a l'iteration prevue"));
				Banc.EgalEntier(Premiere.LireEtat().CommandesIgnorees, CommandesEnAttenteMax - 1, TEXT("toutes les commandes de remplissage ont ete traitees"));
				Banc.Vrai(EscouadeEst(Premiere, 0, 1, 0, 0, false) && EscouadeEst(Seconde, 0, 1, 100, 100, false),
					TEXT("au plafond, chaque simulation n'a garde que la creation arrivee a temps"));
				Banc.Vrai(Premiere.Empreinte() != Seconde.Empreinte(), TEXT("au plafond, l'ordre d'arrivee decide : les deux simulations divergent"));
				Banc.Vrai(Acceptee(Premiere.Soumettre(Cmd(6, 0, 0, Arreter, 1))), TEXT("file videe : commande acceptee de nouveau"));
			}

			// Commandes deja appliquees : elles ne comptent plus, ni dans l'attente, ni dans la sauvegarde, ni pour le rang libre.
			{
				FSimulation Simulation;
				for (uint32 Rang = 0; Rang < 10; ++Rang)
				{
					Simulation.Soumettre(Cmd(0, 0, Rang, Creer, 0, 0, 10));
				}
				for (uint32 Rang = 0; Rang < 100; ++Rang)
				{
					Simulation.Soumettre(Cmd(50, 1, Rang, Arreter, 1));
				}
				Simulation.Avancer();
				Banc.EgalEntier(Simulation.CommandesEnAttente(), 100, TEXT("les commandes appliquees ne sont plus en attente"));
				Banc.EgalEntier(Simulation.SequenceLibre(0), 0, TEXT("rang libre : les commandes appliquees ne comptent plus"));
				Banc.EgalEntier(Simulation.SequenceLibre(1), 100, TEXT("rang libre : apres la derniere commande en attente"));
				Banc.Vrai(Simulation.Soumettre(Cmd(0, 0, 99, Creer)) == ESoumission::Tardive, TEXT("iteration deja jouee : tardive, meme si ses commandes sont encore en tete de file"));
				Banc.Vrai(Acceptee(Simulation.Soumettre(Cmd(1, 0, 10, Deplacer, 1, 500, 0))), TEXT("commande pour l'iteration suivante acceptee"));
				Banc.EgalEntier(Simulation.CommandesEnAttente(), 101, TEXT("une commande de plus en attente"));

				FEcrivain Ecrivain;
				Simulation.Serialiser(Ecrivain);
				const TArray<uint8> Octets = Ecrivain.Lire();
				// Graine, etat de 32 octets, dix escouades de 26 octets, puis le nombre de commandes et 22 octets par commande.
				Banc.EgalEntier(Octets.Num(), 8 + 32 + 10 * 26 + 4 + 101 * 22, TEXT("la sauvegarde ne contient que les commandes en attente"));
				FSimulation Copie;
				Banc.Vrai(Charger(Copie, Octets) && Copie.CommandesEnAttente() == 101, TEXT("la sauvegarde se recharge avec les memes commandes en attente"));

				Simulation.Avancer();
				Copie.Avancer();
				Banc.Vrai(EscouadeEst(Simulation, 0, 1, 10, 0, true), TEXT("la commande inseree apres les commandes appliquees agit a son iteration"));
				Banc.Egal64(Copie.Empreinte(), Simulation.Empreinte(), TEXT("la copie rechargee joue la meme iteration"));
				Simulation.AvancerJusqua(51);
				Copie.AvancerJusqua(51);
				Banc.Vrai(Simulation.CommandesEnAttente() == 0 && Simulation.LireEtat().CommandesIgnorees == 100, TEXT("le reste de la file est joue a son iteration"));
				Banc.Egal64(Copie.Empreinte(), Simulation.Empreinte(), TEXT("la copie rechargee finit dans le meme etat"));
			}

			// Identifiants epuises : plus aucune creation, et le compteur ne deborde pas.
			{
				FSauvegardeEcrite Presque;
				Presque.Iteration = 3;
				Presque.ProchainId = MAX_int32 - 1;
				FSimulation Simulation;
				Banc.Vrai(Charger(Simulation, Presque.Octets()), TEXT("sauvegarde a deux identifiants de la fin acceptee"));
				Simulation.Soumettre(Cmd(3, 0, 0, Creer, 1, 2, 3));
				Simulation.Soumettre(Cmd(3, 0, 1, Creer, 4, 5, 6));
				Simulation.Avancer();
				Banc.Vrai(Simulation.LireEtat().Escouades.Num() == 1 && EscouadeEst(Simulation, 0, MAX_int32 - 1, 1, 2, false), TEXT("le dernier identifiant est attribue"));
				Banc.EgalEntier(Simulation.LireEtat().ProchainId, MAX_int32, TEXT("le compteur d'identifiants s'arrete a sa borne"));
				Banc.EgalEntier(Simulation.LireEtat().CommandesIgnorees, 1, TEXT("identifiants epuises : la creation suivante est ignoree"));
				FEcrivain Ecrivain;
				Simulation.Serialiser(Ecrivain);
				Banc.Vrai(SeCharge(Ecrivain.Lire()), TEXT("identifiants epuises : l'etat se sauvegarde et se recharge"));
			}

			// Derniere iteration.
			{
				FSimulation Tardive;
				const TArray<uint8> PresqueFinie = SauvegardeALaMain(IterationMax - 1, false, 0, 0, 0, 0, 0, 0);
				Banc.Vrai(Charger(Tardive, PresqueFinie), TEXT("sauvegarde a la veille de la derniere iteration acceptee"));
				Banc.Vrai(Acceptee(Tardive.Soumettre(Cmd(IterationMax - 1, 0, 0, Creer, 1, 2, 3))), TEXT("commande pour la derniere iteration jouable acceptee"));
				Tardive.Avancer();
				Banc.EgalEntier(Tardive.LireEtat().Iteration, IterationMax, TEXT("derniere iteration atteinte"));
				Banc.EgalEntier(Tardive.LireEtat().Escouades.Num(), 1, TEXT("la derniere commande a ete appliquee"));
				const uint64 Finale = Tardive.Empreinte();
				Tardive.Avancer();
				Tardive.AvancerJusqua(MAX_int32);
				Banc.EgalEntier(Tardive.LireEtat().Iteration, IterationMax, TEXT("la simulation n'avance plus apres la derniere iteration"));
				Banc.Egal64(Tardive.Empreinte(), Finale, TEXT("l'etat ne change plus apres la derniere iteration"));
				Banc.Vrai(Tardive.Soumettre(Cmd(IterationMax, 0, 1, Creer)) == ESoumission::Invalide
					&& Tardive.Soumettre(Cmd(IterationMax - 1, 0, 1, Creer)) == ESoumission::Tardive, TEXT("plus aucune commande acceptee"));

				Banc.Vrai(SeCharge(SauvegardeALaMain(IterationMax, false, 0, 0, 0, 0, 0, 0)), TEXT("sauvegarde a la derniere iteration acceptee"));
				Banc.Vrai(!SeCharge(SauvegardeALaMain(IterationMax + 1, false, 0, 0, 0, 0, 0, 0)), TEXT("sauvegarde au-dela de la derniere iteration refusee"));
			}
		}

		void TesterOrdreCanonique(FBanc& Banc)
		{
			Banc.Section(TEXT("ordre canonique"));

			TArray<FCommande> Lot = LotDeCommandes(2026, 12, 80, 40);
			// Deux commandes strictement egales : leur ordre relatif ne doit rien changer.
			const FCommande Doublon = Lot[20];
			Lot.Add(Doublon);

			TArray<FCommande> Battu = Lot;
			FAlea Alea(5);
			for (int32 Rang = Battu.Num() - 1; Rang > 0; --Rang)
			{
				const int32 Autre = Alea.Entre(0, Rang);
				Battu.Swap(Rang, Autre);
			}

			FSimulation Donne;
			FSimulation Inverse;
			FSimulation Melange;
			FSimulation AuFilDeLEau;
			bool bAcceptees = true;
			for (const FCommande& Commande : Lot)
			{
				bAcceptees = Acceptee(Donne.Soumettre(Commande)) && bAcceptees;
			}
			for (int32 Rang = Lot.Num() - 1; Rang >= 0; --Rang)
			{
				bAcceptees = Acceptee(Inverse.Soumettre(Lot[Rang])) && bAcceptees;
			}
			for (const FCommande& Commande : Battu)
			{
				bAcceptees = Acceptee(Melange.Soumettre(Commande)) && bAcceptees;
			}

			bool bMemesEmpreintes = true;
			for (int32 Iteration = 0; Iteration <= 60; ++Iteration)
			{
				// La quatrieme simulation ne recoit ses commandes qu'au dernier moment.
				for (const FCommande& Commande : Battu)
				{
					if (Commande.Iteration == Iteration)
					{
						bAcceptees = Acceptee(AuFilDeLEau.Soumettre(Commande)) && bAcceptees;
					}
				}
				const uint64 Reference = Donne.Empreinte();
				bMemesEmpreintes = bMemesEmpreintes && Inverse.Empreinte() == Reference
					&& Melange.Empreinte() == Reference && AuFilDeLEau.Empreinte() == Reference;
				Donne.Avancer();
				Inverse.Avancer();
				Melange.Avancer();
				AuFilDeLEau.Avancer();
			}
			Banc.Vrai(bAcceptees, TEXT("toutes les commandes du lot sont acceptees"));
			Banc.Vrai(bMemesEmpreintes, TEXT("l'ordre et le moment de soumission ne changent aucune empreinte"));
			Banc.Vrai(Donne.LireEtat().CommandesAppliquees > 30, TEXT("le lot applique bien des commandes"));
			Banc.Vrai(Donne.LireEtat().CommandesIgnorees > 0, TEXT("le lot contient bien des commandes ignorees"));
			Banc.Vrai(Donne.LireEtat().Escouades.Num() > 5, TEXT("le lot laisse bien des escouades en jeu"));

			// L'ordre lui-meme, cle par cle : iteration, joueur, rang, type, puis A, B et C. Chaque ligne est
			// strictement apres la precedente, et le commentaire dit quelle cle le prouve.
			const FCommande Croissantes[19] =
			{
				Cmd(0, 0, 0, Creer, MIN_int32, MIN_int32, MIN_int32),
				Cmd(0, 0, 0, Creer, MIN_int32, MIN_int32, -1),                           // C, avec son signe
				Cmd(0, 0, 0, Creer, MIN_int32, MIN_int32, 0),
				Cmd(0, 0, 0, Creer, MIN_int32, -1, MIN_int32),                           // B passe avant C
				Cmd(0, 0, 0, Creer, MIN_int32, 0, MIN_int32),                            // B, avec son signe
				Cmd(0, 0, 0, Creer, -1, MAX_int32, MAX_int32),                           // A passe avant B
				Cmd(0, 0, 0, Creer, 0, MIN_int32, MIN_int32),                            // A, avec son signe
				Cmd(0, 0, 0, Deplacer, MIN_int32, MIN_int32, MIN_int32),                 // le type passe avant A
				Cmd(0, 0, 0, Retirer, MIN_int32, 0, 0),
				Cmd(0, 0, 1, Creer, MIN_int32, MIN_int32, MIN_int32),                    // le rang passe avant le type
				Cmd(0, 0, 0x7FFFFFFFu, Retirer, MAX_int32, MAX_int32, MAX_int32),
				Cmd(0, 0, 0x80000000u, Creer, MIN_int32, MIN_int32, MIN_int32),          // le rang n'a pas de signe
				Cmd(0, 0, 0xFFFFFFFFu, Creer, 0, 0, 0),
				Cmd(0, 1, 0, Creer, MIN_int32, MIN_int32, MIN_int32),                    // le joueur passe avant le rang
				Cmd(0, 127, 0xFFFFFFFFu, Retirer, MAX_int32, MAX_int32, MAX_int32),
				Cmd(0, 128, 0, Creer, MIN_int32, MIN_int32, MIN_int32),                  // le joueur n'a pas de signe
				Cmd(0, 255, 0, Creer, 0, 0, 0),
				Cmd(1, 0, 0, Creer, MIN_int32, MIN_int32, MIN_int32),                    // l'iteration passe avant le joueur
				Cmd(IterationMax - 1, 0, 0, Creer, 0, 0, 0),
			};
			int32 PremierEcart = -1;
			for (int32 Petit = 0; Petit < 19 && PremierEcart < 0; ++Petit)
			{
				if (CommandeAvant(Croissantes[Petit], Croissantes[Petit]))
				{
					PremierEcart = Petit * 100 + Petit;
				}
				for (int32 Grand = Petit + 1; Grand < 19 && PremierEcart < 0; ++Grand)
				{
					if (!CommandeAvant(Croissantes[Petit], Croissantes[Grand]) || CommandeAvant(Croissantes[Grand], Croissantes[Petit]))
					{
						PremierEcart = Petit * 100 + Grand;
					}
				}
			}
			Banc.EgalEntier(PremierEcart, -1, TEXT("ordre canonique : premiere paire mal classee (100 x rang + rang)"));

			// Inserees dans le desordre, les memes commandes se retrouvent dans cet ordre.
			TArray<FCommande> Triees;
			for (int32 Rang = 0; Rang < 19; ++Rang)
			{
				InsererCommandeTriee(Triees, Croissantes[(Rang * 7 + 5) % 19]);
			}
			bool bTriees = Triees.Num() == 19;
			for (int32 Rang = 0; bTriees && Rang < 19; ++Rang)
			{
				bTriees = CommandesEgales(Triees[Rang], Croissantes[Rang]);
			}
			Banc.Vrai(bTriees, TEXT("l'insertion triee retrouve l'ordre canonique"));

			// Deux commandes de meme iteration, meme joueur et meme rang : le contenu departage, quel que soit l'ordre d'arrivee.
			{
				const FCommande Petite = Cmd(0, 0, 0, Creer, 0, 0, 10);
				const FCommande Grande = Cmd(0, 0, 0, Creer, 500, 0, 10);
				FSimulation Directe;
				FSimulation Renversee;
				Directe.Soumettre(Petite);
				Directe.Soumettre(Grande);
				Renversee.Soumettre(Grande);
				Renversee.Soumettre(Petite);
				Directe.Avancer();
				Renversee.Avancer();
				Banc.Vrai(EscouadeEst(Directe, 0, 1, 0, 0, false) && EscouadeEst(Directe, 1, 2, 500, 0, false),
					TEXT("meme cle, contenus differents : appliquees dans l'ordre du contenu"));
				Banc.Vrai(EscouadeEst(Renversee, 0, 1, 0, 0, false) && EscouadeEst(Renversee, 1, 2, 500, 0, false),
					TEXT("meme cle, contenus differents : meme resultat dans l'autre ordre d'arrivee"));
			}
		}

		void TesterComparateurs(FBanc& Banc)
		{
			Banc.Section(TEXT("comparateurs"));

			// CommandesEgales doit voir chacun des sept champs.
			const FCommande Reference = Cmd(4, 2, 9, Deplacer, 11, 22, 33);
			const FCommande Variantes[7] =
			{
				Cmd(5, 2, 9, Deplacer, 11, 22, 33), Cmd(4, 3, 9, Deplacer, 11, 22, 33), Cmd(4, 2, 8, Deplacer, 11, 22, 33),
				Cmd(4, 2, 9, Arreter, 11, 22, 33), Cmd(4, 2, 9, Deplacer, 12, 22, 33), Cmd(4, 2, 9, Deplacer, 11, 23, 33),
				Cmd(4, 2, 9, Deplacer, 11, 22, 34),
			};
			Banc.Vrai(CommandesEgales(Reference, Cmd(4, 2, 9, Deplacer, 11, 22, 33)), TEXT("deux commandes identiques sont egales"));
			int32 ChampsVus = 0;
			for (int32 Rang = 0; Rang < 7; ++Rang)
			{
				ChampsVus += (!CommandesEgales(Reference, Variantes[Rang]) && !CommandesEgales(Variantes[Rang], Reference)) ? 1 : 0;
			}
			Banc.EgalEntier(ChampsVus, 7, TEXT("une difference sur n'importe lequel des sept champs est vue"));

			// RelecturesEgales doit voir l'en-tete, chaque commande et chaque empreinte.
			const FRelecture Partie = GenererPartie(21, 300);
			Banc.Vrai(Partie.Commandes.Num() > 10 && Partie.Empreintes.Num() == 4, TEXT("la partie comparee a des commandes et quatre empreintes"));
			Banc.Vrai(RelecturesEgales(Partie, Partie), TEXT("une relecture est egale a elle-meme"));
			if (Partie.Commandes.Num() > 10 && Partie.Empreintes.Num() == 4)
			{
				TArray<FRelecture> Autres;
				Autres.Init(Partie, 10);
				Autres[0].Version += 1;
				Autres[1].Config.Graine += 1;
				Autres[2].Iterations += 1;
				Autres[3].Commandes.Last().C += 1;
				Autres[4].Commandes[0].Sequence += 1;
				Autres[5].Commandes.Pop();
				Autres[6].Empreintes[1].Iteration += 1;
				Autres[7].Empreintes.Last().Empreinte ^= 1;
				Autres[8].Empreintes.Pop();
				Autres[9].Commandes.Add(Partie.Commandes.Last());
				int32 EcartsVus = 0;
				for (const FRelecture& Autre : Autres)
				{
					EcartsVus += (!RelecturesEgales(Partie, Autre) && !RelecturesEgales(Autre, Partie)) ? 1 : 0;
				}
				Banc.EgalEntier(EcartsVus, 10, TEXT("chacune des dix differences entre relectures est vue"));
			}
		}

		void TesterReference(FBanc& Banc)
		{
			Banc.Section(TEXT("partie de reference"));

			// Meme partie que le modele independant : treize commandes, dont deux ignorees.
			const FCommande Scenario[13] =
			{
				Cmd(0, 0, 0, Creer, 0, 0, 150),
				Cmd(0, 1, 0, Creer, 10000, -5000, 100),
				Cmd(0, 0, 1, Deplacer, 1, 3000, 4000),
				Cmd(0, 2, 0, Creer, -7, 9, 1),
				Cmd(1, 2, 1, Deplacer, 3, -2, 4),
				Cmd(5, 1, 1, Deplacer, 2, -1000000000, 1000000000),
				Cmd(5, 1, 2, Deplacer, 1, 0, 0),
				Cmd(10, 0, 2, Arreter, 1),
				Cmd(12, 0, 3, Deplacer, 1, -333, 777),
				Cmd(20, 1, 3, Retirer, 2),
				Cmd(20, 1, 4, Creer, 2000000000, -2000000000, 999999),
				Cmd(21, 1, 5, Deplacer, 4, -1000000000, 1000000000),
				Cmd(30, 0, 4, Retirer, 99),
			};
			const int32 Releves[10] = { 0, 1, 2, 10, 11, 20, 21, 22, 34, 60 };
			const uint64 Empreintes[10] =
			{
				0xb2cfb9ee582a8757ull, 0xd12e30b17dc17a93ull, 0xca14d8f1e4c16923ull, 0x1771b250538d50a5ull, 0x12b0d7b2772c48e2ull,
				0x7ecce833cff925a4ull, 0x845878ded8bb1f17ull, 0x879750bf4691fb5dull, 0xc732ba847570227aull, 0x3cba642adcc95f08ull,
			};

			FConfigPartie Config;
			Config.Graine = 0x1234;
			FSimulation Simulation(Config);
			for (int32 Rang = 12; Rang >= 0; --Rang)
			{
				Simulation.Soumettre(Scenario[Rang]);
			}
			for (int32 Rang = 0; Rang < 10; ++Rang)
			{
				Simulation.AvancerJusqua(Releves[Rang]);
				Banc.Egal64(Simulation.Empreinte(), Empreintes[Rang], TEXT("empreinte du modele independant"));
			}
			Banc.EgalEntier(Simulation.LireEtat().Escouades.Num(), 3, TEXT("trois escouades a la fin"));
			Banc.Vrai(EscouadeEst(Simulation, 0, 1, -333, 777, false), TEXT("escouade 1 arrivee"));
			Banc.Vrai(EscouadeEst(Simulation, 1, 3, -2, 4, false), TEXT("escouade 3 arrivee"));
			Banc.Vrai(EscouadeEst(Simulation, 2, 4, 997242310, -997242310, true), TEXT("escouade 4 en route"));
			Banc.EgalEntier(Simulation.LireEtat().ProchainId, 5, TEXT("prochain identifiant"));
			Banc.EgalEntier(Simulation.LireEtat().CommandesAppliquees, 11, TEXT("onze commandes appliquees"));
			Banc.EgalEntier(Simulation.LireEtat().CommandesIgnorees, 2, TEXT("deux commandes ignorees"));

			FSimulation Vide;
			Banc.Egal64(Vide.Empreinte(), 0x56277359bda9cd65ull, TEXT("empreinte de l'etat initial, graine 0"));
			FConfigPartie QuaranteDeux;
			QuaranteDeux.Graine = 42;
			Banc.Egal64(FSimulation(QuaranteDeux).Empreinte(), 0x03bee837768fa90full, TEXT("empreinte de l'etat initial, graine 42"));
		}

		void TesterSauvegarde(FBanc& Banc)
		{
			Banc.Section(TEXT("sauvegarde"));

			// Une partie en cours : des escouades en marche et des commandes encore en attente.
			FConfigPartie Config;
			Config.Graine = 77;
			FSimulation Origine(Config);
			for (const FCommande& Commande : LotDeCommandes(77, 12, 80, 40))
			{
				Origine.Soumettre(Commande);
			}
			Origine.AvancerJusqua(20);
			Banc.Vrai(Origine.LireEtat().Escouades.Num() > 0 && Origine.CommandesEnAttente() > 0, TEXT("la partie sauvegardee a des escouades et des commandes en attente"));

			FEcrivain Ecrivain;
			Origine.Serialiser(Ecrivain);
			const TArray<uint8> Octets = Ecrivain.Lire();

			FSimulation Copie;
			FLecteur Lecteur(Octets);
			Banc.Vrai(Copie.Deserialiser(Lecteur), TEXT("chargement reussi"));
			Banc.Egal64(Copie.Empreinte(), Origine.Empreinte(), TEXT("meme empreinte apres chargement"));
			Banc.Egal64(Copie.LireConfig().Graine, 77, TEXT("meme graine apres chargement"));
			Banc.EgalEntier(Copie.CommandesEnAttente(), Origine.CommandesEnAttente(), TEXT("memes commandes en attente"));

			FEcrivain Reecrit;
			Copie.Serialiser(Reecrit);
			Banc.Vrai(Reecrit.Lire() == Octets, TEXT("la copie se sauvegarde a l'octet pres comme l'origine"));

			bool bMemeSuite = true;
			for (int32 Iteration = 20; Iteration < 80; ++Iteration)
			{
				Origine.Avancer();
				Copie.Avancer();
				bMemeSuite = bMemeSuite && Origine.Empreinte() == Copie.Empreinte();
			}
			Banc.Vrai(bMemeSuite, TEXT("l'origine et la copie jouent la meme suite"));
			Banc.EgalEntier(Copie.CommandesEnAttente(), 0, TEXT("toutes les commandes chargees ont ete jouees"));

			// Un chargement rate ne doit rien changer.
			FConfigPartie ConfigTemoin;
			ConfigTemoin.Graine = 5;
			FSimulation Temoin(ConfigTemoin);
			Temoin.Soumettre(Cmd(0, 0, 0, Creer, 1, 2, 3));
			Temoin.Soumettre(Cmd(9, 0, 1, Deplacer, 1, 50, 60));
			Temoin.AvancerJusqua(3);
			const uint64 EmpreinteTemoin = Temoin.Empreinte();
			bool bTronquesRefuses = true;
			for (int32 Taille = 0; Taille < Octets.Num(); ++Taille)
			{
				FLecteur Tronque(Octets.GetData(), Taille);
				bTronquesRefuses = !Temoin.Deserialiser(Tronque) && bTronquesRefuses;
			}
			Banc.Vrai(bTronquesRefuses, TEXT("sauvegarde tronquee refusee, ou que soit la coupure"));
			Banc.Vrai(Temoin.Empreinte() == EmpreinteTemoin && Temoin.CommandesEnAttente() == 1 && Temoin.LireConfig().Graine == 5,
				TEXT("chargement rate : simulation inchangee"));

			// Sauvegardes alterees champ par champ.
			{
				TArray<uint8> Alteree = Octets;
				Alteree.Add(0);
				Banc.Vrai(!SeCharge(Alteree), TEXT("octet en trop refuse"));
			}
			{
				TArray<uint8> Alteree = Octets;
				EcrireI32(Alteree, PlaceVersion, VersionFormat + 1);
				Banc.Vrai(!SeCharge(Alteree), TEXT("autre version refusee"));
			}
			{
				TArray<uint8> Alteree = Octets;
				EcrireI32(Alteree, PlaceIteration, -1);
				Banc.Vrai(!SeCharge(Alteree), TEXT("iteration negative refusee"));
			}
			{
				TArray<uint8> Alteree = Octets;
				EcrireI32(Alteree, PlaceIteration, 41);
				Banc.Vrai(!SeCharge(Alteree), TEXT("commande en attente pour une iteration deja jouee refusee"));
			}
			{
				TArray<uint8> Alteree = Octets;
				EcrireI32(Alteree, PlaceNombreEscouades, MAX_int32);
				Banc.Vrai(!SeCharge(Alteree), TEXT("nombre d'escouades absurde refuse"));
			}
			{
				TArray<uint8> Alteree = Octets;
				EcrireI32(Alteree, PlaceProchainId, 1);
				Banc.Vrai(!SeCharge(Alteree), TEXT("identifiant pas encore attribue refuse"));
			}
			{
				TArray<uint8> Alteree = Octets;
				EcrireI32(Alteree, PlaceId, 0);
				Banc.Vrai(!SeCharge(Alteree), TEXT("identifiant nul refuse"));
			}
			{
				TArray<uint8> Alteree = Octets;
				EcrireI32(Alteree, PlacePositionX, LimiteMonde + 1);
				Banc.Vrai(!SeCharge(Alteree), TEXT("position hors du monde refusee"));
			}
			{
				TArray<uint8> Alteree = Octets;
				EcrireI32(Alteree, PlaceVitesse, -1);
				Banc.Vrai(!SeCharge(Alteree), TEXT("vitesse negative refusee"));
			}
			{
				TArray<uint8> Alteree = Octets;
				EcrireI32(Alteree, PlaceVitesse, VitesseMax + 1);
				Banc.Vrai(!SeCharge(Alteree), TEXT("vitesse excessive refusee"));
			}
			{
				TArray<uint8> Alteree = Octets;
				if (Alteree.IsValidIndex(PlaceMouvement))
				{
					Alteree[PlaceMouvement] = 2;
				}
				Banc.Vrai(!SeCharge(Alteree), TEXT("etat de marche ni vrai ni faux refuse"));
			}

			// Coherence entre marche, vitesse et cible.
			Banc.Vrai(SeCharge(SauvegardeALaMain(3, true, 0, 0, 10, 10, 5, 1)), TEXT("escouade en marche vers sa cible acceptee"));
			Banc.Vrai(SeCharge(SauvegardeALaMain(3, true, 0, 0, 10, 10, 0, 0)), TEXT("escouade sans vitesse, a l'arret loin de sa cible, acceptee"));
			Banc.Vrai(!SeCharge(SauvegardeALaMain(3, true, 0, 0, 10, 10, 0, 1)), TEXT("escouade en marche sans vitesse refusee"));
			Banc.Vrai(!SeCharge(SauvegardeALaMain(3, true, 7, 7, 7, 7, 5, 1)), TEXT("escouade en marche deja sur sa cible refusee"));
			Banc.Vrai(!SeCharge(SauvegardeALaMain(3, true, 0, 0, 10, 10, 5, 0)), TEXT("escouade a l'arret alors qu'elle a une vitesse et une cible a atteindre refusee"));
			Banc.Vrai(SeCharge(SauvegardeALaMain(3, true, 7, 7, 7, 7, 5, 0)), TEXT("escouade a l'arret sur sa cible acceptee"));

			// Bornes du monde, axe par axe et cote par cote : au bord, acceptee ; un millimetre plus loin, refusee.
			{
				struct FBord
				{
					int32 X;
					int32 Y;
					int32 CibleX;
					int32 CibleY;
					const TCHAR* Nom;
				};
				const FBord Bords[8] =
				{
					{ -1, 0, 0, 0, TEXT("position X, cote negatif") }, { 1, 0, 0, 0, TEXT("position X, cote positif") },
					{ 0, -1, 0, 0, TEXT("position Y, cote negatif") }, { 0, 1, 0, 0, TEXT("position Y, cote positif") },
					{ 0, 0, -1, 0, TEXT("cible X, cote negatif") }, { 0, 0, 1, 0, TEXT("cible X, cote positif") },
					{ 0, 0, 0, -1, TEXT("cible Y, cote negatif") }, { 0, 0, 0, 1, TEXT("cible Y, cote positif") },
				};
				for (const FBord& Bord : Bords)
				{
					const int32 Bout = LimiteMonde;
					const int32 Dehors = LimiteMonde + 1;
					Banc.Vrai(SeCharge(SauvegardeALaMain(3, true, Bord.X * Bout, Bord.Y * Bout, Bord.CibleX * Bout, Bord.CibleY * Bout, 0, 0)),
						*FString::Printf(TEXT("%s : au bord du monde, acceptee"), Bord.Nom));
					Banc.Vrai(!SeCharge(SauvegardeALaMain(3, true, Bord.X * Dehors, Bord.Y * Dehors, Bord.CibleX * Dehors, Bord.CibleY * Dehors, 0, 0)),
						*FString::Printf(TEXT("%s : hors du monde, refusee"), Bord.Nom));
				}
			}

			// Identifiants : strictement croissants, et tous deja attribues.
			{
				FSauvegardeEcrite Deux;
				Deux.Iteration = 3;
				Deux.ProchainId = 3;
				Deux.Appliquees = 2;
				Deux.Escouades.SetNum(2);
				Deux.Escouades[1].Id = 2;
				Banc.Vrai(SeCharge(Deux.Octets()), TEXT("deux escouades d'identifiants 1 et 2 acceptees"));

				FSauvegardeEcrite Fausse = Deux;
				Fausse.Escouades[0].Id = 2;
				Fausse.Escouades[1].Id = 1;
				Banc.Vrai(!SeCharge(Fausse.Octets()), TEXT("identifiants decroissants refuses"));
				Fausse = Deux;
				Fausse.Escouades[1].Id = 1;
				Banc.Vrai(!SeCharge(Fausse.Octets()), TEXT("identifiant en double refuse"));
				Fausse = Deux;
				Fausse.ProchainId = 2;
				Banc.Vrai(!SeCharge(Fausse.Octets()), TEXT("identifiant egal au prochain identifiant refuse"));
				Fausse = Deux;
				Fausse.Escouades[0].Id = -1;
				Banc.Vrai(!SeCharge(Fausse.Octets()), TEXT("identifiant negatif refuse"));

				FSauvegardeEcrite Vide;
				Banc.Vrai(SeCharge(Vide.Octets()), TEXT("sauvegarde sans escouade, prochain identifiant 1, acceptee"));
				Vide.ProchainId = 0;
				Banc.Vrai(!SeCharge(Vide.Octets()), TEXT("prochain identifiant nul refuse"));
				Vide.ProchainId = MIN_int32;
				Banc.Vrai(!SeCharge(Vide.Octets()), TEXT("prochain identifiant negatif refuse"));
			}

			// Nombre d'escouades : le plafond passe, une de plus ne passe pas.
			{
				FSauvegardeEcrite Pleine;
				Pleine.Iteration = 1;
				Pleine.ProchainId = EscouadesMax + 2;
				Pleine.Escouades.SetNum(EscouadesMax);
				for (int32 Rang = 0; Rang < EscouadesMax; ++Rang)
				{
					Pleine.Escouades[Rang].Id = Rang + 1;
				}
				Banc.Vrai(SeCharge(Pleine.Octets()), TEXT("sauvegarde au plafond d'escouades acceptee"));
				FEscouadeEcrite DeTrop;
				DeTrop.Id = EscouadesMax + 1;
				Pleine.Escouades.Add(DeTrop);
				Banc.Vrai(!SeCharge(Pleine.Octets()), TEXT("sauvegarde a une escouade de trop refusee"));
			}

			// Commandes en attente : type, iteration, ordre et nombre.
			{
				FSauvegardeEcrite Attente;
				Attente.Iteration = 3;
				Attente.ProchainId = 2;
				Attente.Appliquees = 1;
				Attente.Escouades.SetNum(1);
				Attente.Commandes.Add(Cmd(3, 0, 0, Deplacer, 1, 10, 10));
				Attente.Commandes.Add(Cmd(IterationMax - 1, 0, 1, Arreter, 1));
				Banc.Vrai(SeCharge(Attente.Octets()), TEXT("commandes en attente pour l'iteration courante et pour la derniere acceptees"));

				FSauvegardeEcrite Fausse = Attente;
				Fausse.Commandes.Swap(0, 1);
				Banc.Vrai(!SeCharge(Fausse.Octets()), TEXT("commandes en attente hors de l'ordre canonique refusees"));
				Fausse = Attente;
				Fausse.Commandes[0].Iteration = 2;
				Banc.Vrai(!SeCharge(Fausse.Octets()), TEXT("commande en attente pour l'iteration precedente refusee"));
				Fausse = Attente;
				Fausse.Commandes[1].Iteration = IterationMax;
				Banc.Vrai(!SeCharge(Fausse.Octets()), TEXT("commande en attente au-dela de la derniere iteration refusee"));
				Fausse = Attente;
				Fausse.Commandes[0].Type = ETypeCommande::Aucune;
				Banc.Vrai(!SeCharge(Fausse.Octets()), TEXT("commande en attente de type Aucune refusee"));
				Fausse = Attente;
				Fausse.Commandes[0].Type = static_cast<ETypeCommande>(5);
				Banc.Vrai(!SeCharge(Fausse.Octets()), TEXT("commande en attente de type inconnu refusee"));

				// Le nombre de commandes suit l'unique escouade de 26 octets.
				const int32 PlaceNombreCommandes = PlacePremiereEscouade + 26;
				TArray<uint8> Alteree = Attente.Octets();
				EcrireI32(Alteree, PlaceNombreCommandes, -1);
				Banc.Vrai(!SeCharge(Alteree), TEXT("nombre de commandes negatif refuse"));
				Alteree = Attente.Octets();
				EcrireI32(Alteree, PlaceNombreCommandes, 1);
				Banc.Vrai(!SeCharge(Alteree), TEXT("nombre de commandes inferieur a ce qui suit refuse"));
				Alteree = Attente.Octets();
				EcrireI32(Alteree, PlaceNombreCommandes, 3);
				Banc.Vrai(!SeCharge(Alteree), TEXT("nombre de commandes superieur a ce qui suit refuse"));

				// Le plafond de la file passe, une commande de plus ne passe pas.
				FSauvegardeEcrite Longue = Attente;
				Longue.Commandes.Reset();
				Longue.Commandes.Reserve(CommandesEnAttenteMax);
				for (int32 Rang = 0; Rang < CommandesEnAttenteMax; ++Rang)
				{
					Longue.Commandes.Add(Cmd(3, 1, static_cast<uint32>(Rang), Arreter, 1));
				}
				TArray<uint8> AuPlafond = Longue.Octets();
				FSimulation Chargee;
				Banc.Vrai(Charger(Chargee, AuPlafond) && Chargee.CommandesEnAttente() == CommandesEnAttenteMax, TEXT("sauvegarde au plafond de la file acceptee"));
				Banc.Vrai(Chargee.Soumettre(Cmd(3, 0, 0, Arreter, 1)) == ESoumission::FilePleine, TEXT("simulation rechargee au plafond : file pleine"));
				FEcrivain UneDePlus;
				UneDePlus.I32(3);
				UneDePlus.U8(1);
				UneDePlus.U32(static_cast<uint32>(CommandesEnAttenteMax));
				UneDePlus.U8(static_cast<uint8>(Arreter));
				UneDePlus.I32(1);
				UneDePlus.I32(0);
				UneDePlus.I32(0);
				AuPlafond.Append(UneDePlus.Lire());
				EcrireI32(AuPlafond, PlaceNombreCommandes, CommandesEnAttenteMax + 1);
				Banc.Vrai(!SeCharge(AuPlafond), TEXT("sauvegarde a une commande en attente de trop refusee"));
			}

			// Sauvegarde de reference, ecrite octet par octet par le modele independant : elle fige la disposition du format,
			// commandes en attente comprises. Tous ses champs different, pour qu'un echange de deux champs se voie.
			{
				static const uint8 Reference[114] =
				{
					0x08, 0x07, 0x06, 0x05, 0x04, 0x03, 0x02, 0x01, 0x01, 0x00, 0x00, 0x00, 0x03, 0x00, 0x00, 0x00,
					0x18, 0x17, 0x16, 0x15, 0x14, 0x13, 0x12, 0x11, 0x06, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00,
					0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x05, 0x00, 0x00, 0x00, 0x02, 0x64, 0x00, 0x00,
					0x00, 0x38, 0xFF, 0xFF, 0xFF, 0x64, 0x00, 0x00, 0x00, 0x38, 0xFF, 0xFF, 0xFF, 0x28, 0x00, 0x00,
					0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x03, 0x00, 0x00, 0x00, 0x02, 0x04, 0x03, 0x02, 0x01, 0x02,
					0x05, 0x00, 0x00, 0x00, 0x4C, 0x04, 0x00, 0x00, 0x38, 0xFF, 0xFF, 0xFF, 0x07, 0x00, 0x00, 0x00,
					0x09, 0x0D, 0x0C, 0x0B, 0x0A, 0x01, 0xF5, 0xFF, 0xFF, 0xFF, 0x16, 0x00, 0x00, 0x00, 0x21, 0x00,
					0x00, 0x00,
				};
				TArray<uint8> OctetsDeReference;
				OctetsDeReference.Append(Reference, 114);

				// La meme sauvegarde, decrite champ par champ.
				FSauvegardeEcrite Decrite;
				Decrite.Graine = 0x0102030405060708ull;
				Decrite.Iteration = 3;
				Decrite.Alea = 0x1112131415161718ull;
				Decrite.ProchainId = 6;
				Decrite.Appliquees = 1;
				FEscouadeEcrite Escouade;
				Escouade.Id = 5;
				Escouade.Joueur = 2;
				Escouade.X = 100;
				Escouade.Y = -200;
				Escouade.CibleX = 100;
				Escouade.CibleY = -200;
				Escouade.Vitesse = 40;
				Decrite.Escouades.Add(Escouade);
				Decrite.Commandes.Add(Cmd(3, 2, 0x01020304u, Deplacer, 5, 1100, -200));
				Decrite.Commandes.Add(Cmd(7, 9, 0x0A0B0C0Du, Creer, -11, 22, 33));
				Banc.Vrai(Decrite.Octets() == OctetsDeReference, TEXT("sauvegarde de reference : les tests l'ecrivent comme le modele"));

				FSimulation Chargee;
				Banc.Vrai(Charger(Chargee, OctetsDeReference), TEXT("sauvegarde de reference acceptee"));
				FEcrivain Reecrite;
				Chargee.Serialiser(Reecrite);
				Banc.Vrai(Reecrite.Lire() == OctetsDeReference, TEXT("sauvegarde de reference reecrite a l'octet pres"));
				Banc.Egal64(Chargee.LireConfig().Graine, 0x0102030405060708ull, TEXT("sauvegarde de reference : graine"));
				Banc.Egal64(Chargee.LireEtat().Alea, 0x1112131415161718ull, TEXT("sauvegarde de reference : etat du generateur"));
				Banc.EgalEntier(Chargee.CommandesEnAttente(), 2, TEXT("sauvegarde de reference : deux commandes en attente"));
				Banc.EgalEntier(Chargee.SequenceLibre(2), 0x01020305, TEXT("sauvegarde de reference : rang libre du joueur 2"));
				Banc.EgalEntier(Chargee.SequenceLibre(9), 0x0A0B0C0E, TEXT("sauvegarde de reference : rang libre du joueur 9"));
				Chargee.Avancer();
				Banc.Egal64(Chargee.Empreinte(), 0x80a7dec2ecc55ae1ull, TEXT("sauvegarde de reference : empreinte du modele une iteration plus tard"));
				Banc.Vrai(EscouadeEst(Chargee, 0, 5, 140, -200, true), TEXT("sauvegarde de reference : la premiere commande agit sur la bonne escouade"));
				Chargee.AvancerJusqua(8);
				Banc.Egal64(Chargee.Empreinte(), 0xf46596ec693dacffull, TEXT("sauvegarde de reference : empreinte du modele a l'iteration 8"));
				const TArray<FEscouade>& Escouades = Chargee.LireEtat().Escouades;
				Banc.Vrai(EscouadeEst(Chargee, 0, 5, 300, -200, true) && EscouadeEst(Chargee, 1, 6, -11, 22, false)
					&& Escouades.Num() == 2 && Escouades[1].Joueur == 9 && Escouades[1].Vitesse == 33,
					TEXT("sauvegarde de reference : la seconde commande cree la bonne escouade"));
			}

			// Apres un chargement, l'emetteur reprend au rang libre : l'ordre de ses commandes est celui de la partie continue.
			{
				FSimulation Continue;
				Continue.Soumettre(Cmd(0, 0, 0, Creer, 0, 0, 100));
				Continue.AvancerJusqua(10);
				Continue.Soumettre(Cmd(13, 0, 1, Deplacer, 1, 10000, 0));
				FEcrivain EnCours;
				Continue.Serialiser(EnCours);
				FSimulation Reprise;
				Banc.Vrai(Charger(Reprise, EnCours.Lire()), TEXT("reprise : chargement reussi"));
				Banc.EgalEntier(Reprise.SequenceLibre(0), 2, TEXT("reprise : le rang libre suit la commande en attente"));
				// Le joueur donne ensuite un second ordre pour la meme iteration : c'est lui qui doit l'emporter.
				Continue.Soumettre(Cmd(13, 0, 2, Deplacer, 1, 0, 10000));
				Reprise.Soumettre(Cmd(13, 0, Reprise.SequenceLibre(0), Deplacer, 1, 0, 10000));
				Continue.AvancerJusqua(14);
				Reprise.AvancerJusqua(14);
				Banc.Vrai(EscouadeEst(Reprise, 0, 1, 0, 100, true), TEXT("reprise : le dernier ordre donne l'emporte"));
				Banc.Egal64(Reprise.Empreinte(), Continue.Empreinte(), TEXT("reprise : meme etat que la partie continue"));
			}

			// Alterations au hasard : rien ne plante, et tout ce qui est accepte se resauvegarde a l'identique.
			FAlea Alea(99);
			int32 Acceptees = 0;
			bool bCanonique = true;
			for (int32 Essai = 0; Essai < 4000; ++Essai)
			{
				TArray<uint8> Mutee = Octets;
				const int32 Mutations = Alea.Entre(1, 3);
				for (int32 Rang = 0; Rang < Mutations; ++Rang)
				{
					const int32 Place = Alea.Entre(0, Mutee.Num() - 1);
					const int32 Valeur = Alea.Entre(0, 255);
					Mutee[Place] = static_cast<uint8>(Valeur);
				}
				FSimulation Essayee;
				FLecteur LecteurMute(Mutee);
				if (Essayee.Deserialiser(LecteurMute))
				{
					++Acceptees;
					FEcrivain Resauvegarde;
					Essayee.Serialiser(Resauvegarde);
					bCanonique = bCanonique && Resauvegarde.Lire() == Mutee;
					Essayee.AvancerJusqua(Essayee.LireEtat().Iteration + 5);
				}
			}
			// Le modele independant, qui a ses propres regles de chargement, en accepte exactement autant.
			Banc.EgalEntier(Acceptees, 1543, TEXT("nombre d'alterations encore acceptees sur 4 000, celui du modele"));
			Banc.Vrai(bCanonique, TEXT("toute sauvegarde acceptee se reecrit a l'octet pres"));
			Banc.EgalEntier(Octets.Num(), 1314, TEXT("taille de la sauvegarde alteree, celle du modele"));
			Banc.Egal64(Fnv1a64(Octets), 0x0ccc314a079254e3ull, TEXT("octets de la sauvegarde d'une partie en cours, ceux du modele"));
		}

		void TesterEnregistreur(FBanc& Banc)
		{
			Banc.Section(TEXT("enregistreur"));

			FConfigPartie Config;
			Config.Graine = 3;
			FEnregistreur Enregistreur(Config);
			Banc.Vrai(Acceptee(Enregistreur.Soumettre(Cmd(0, 0, 0, Creer, 0, 0, 100))), TEXT("creation enregistree"));
			Banc.Vrai(Acceptee(Enregistreur.Soumettre(Cmd(10, 0, 1, Deplacer, 1, 90000, 0))), TEXT("deplacement enregistre"));
			Banc.Vrai(Acceptee(Enregistreur.Soumettre(Cmd(400, 0, 2, Arreter, 1))), TEXT("commande lointaine enregistree"));
			Banc.Vrai(Enregistreur.Soumettre(Cmd(0, 0, 3, ETypeCommande::Aucune)) == ESoumission::Invalide, TEXT("commande refusee par la simulation, avec son motif"));

			Enregistreur.AvancerJusqua(150);
			const FRelecture Partielle = Enregistreur.Extraire();
			Banc.EgalEntier(Partielle.Iterations, 150, TEXT("extrait a 150 iterations"));
			Banc.EgalEntier(Partielle.Empreintes.Num(), 3, TEXT("extrait : empreintes a 0, 100 et 150"));
			Banc.EgalEntier(Partielle.Commandes.Num(), 2, TEXT("extrait : la commande pas encore jouee n'y est pas"));
			Banc.Vrai(Rejouer(Partielle).bConforme, TEXT("extrait conforme a la relecture"));

			Enregistreur.AvancerJusqua(300);
			const FRelecture Suite = Enregistreur.Extraire();
			Banc.EgalEntier(Suite.Empreintes.Num(), 4, TEXT("suite : empreintes a 0, 100, 200 et 300, sans celle de l'extrait"));
			Banc.Vrai(Rejouer(Suite).bConforme, TEXT("suite conforme a la relecture"));

			Enregistreur.AvancerJusqua(450);
			const FRelecture Complete = Enregistreur.Extraire();
			Banc.EgalEntier(Complete.Empreintes.Num(), 6, TEXT("fin : six empreintes"));
			Banc.EgalEntier(Complete.Commandes.Num(), 3, TEXT("fin : les trois commandes acceptees"));
			const FRapportRelecture Rapport = Rejouer(Complete);
			Banc.Vrai(Rapport.bConforme && Rapport.EmpreintesVerifiees == 6 && Rapport.PremiereDivergence == -1, TEXT("fin conforme a la relecture"));
			Banc.Egal64(Rapport.EmpreinteFinale, Enregistreur.LireSimulation().Empreinte(), TEXT("la relecture finit dans le meme etat que la partie"));

			// Une commande soumise trop tard n'est ni jouee ni notee.
			Banc.Vrai(Enregistreur.Soumettre(Cmd(449, 0, 3, Arreter, 1)) == ESoumission::Tardive, TEXT("commande tardive refusee par l'enregistreur"));
			Banc.EgalEntier(Enregistreur.Extraire().Commandes.Num(), 3, TEXT("une commande refusee n'entre pas dans la relecture"));
		}

		void TesterRelecture(FBanc& Banc)
		{
			Banc.Section(TEXT("relecture"));

			const FRelecture Partie = GenererPartie(7, 1000);
			Banc.EgalEntier(Partie.Iterations, 1000, TEXT("partie de 1 000 iterations"));
			Banc.EgalEntier(Partie.Empreintes.Num(), 11, TEXT("onze empreintes"));
			Banc.Vrai(Partie.Commandes.Num() > 100, TEXT("plus de cent commandes"));
			const FRapportRelecture Rapport = Rejouer(Partie);
			Banc.Vrai(Rapport.bConforme && Rapport.Erreur.IsEmpty(), TEXT("partie conforme a la relecture"));
			Banc.EgalEntier(Rapport.EmpreintesVerifiees, 11, TEXT("onze empreintes verifiees"));
			Banc.EgalEntier(Rapport.PremiereDivergence, -1, TEXT("aucune divergence"));
			if (Partie.Empreintes.Num() > 0)
			{
				Banc.Egal64(Rapport.EmpreinteFinale, Partie.Empreintes.Last().Empreinte, TEXT("empreinte finale retrouvee"));
			}
			bool bRecalculees = Rapport.Recalculees.Num() == Partie.Empreintes.Num();
			for (int32 Rang = 0; bRecalculees && Rang < Partie.Empreintes.Num(); ++Rang)
			{
				bRecalculees = Rapport.Recalculees[Rang].Iteration == Partie.Empreintes[Rang].Iteration
					&& Rapport.Recalculees[Rang].Empreinte == Partie.Empreintes[Rang].Empreinte;
			}
			Banc.Vrai(bRecalculees, TEXT("partie conforme : les empreintes recalculees sont celles de la relecture"));

			const FRelecture Courte = GenererPartie(8, 250);
			Banc.EgalEntier(Courte.Empreintes.Num(), 4, TEXT("duree non multiple de 100 : empreinte finale ajoutee"));
			Banc.Vrai(Rejouer(Courte).bConforme, TEXT("partie courte conforme"));

			const FRelecture Nulle = GenererPartie(9, 0);
			Banc.Vrai(Nulle.Iterations == 0 && Nulle.Commandes.Num() == 0 && Nulle.Empreintes.Num() == 1, TEXT("partie de duree nulle : etat initial seul"));
			Banc.Vrai(Rejouer(Nulle).bConforme, TEXT("partie de duree nulle conforme"));
			Banc.Vrai(GenererPartie(9, -50).Iterations == 0, TEXT("duree negative : partie de duree nulle"));

			// Aller-retour par le texte.
			const FString Texte = FormaterRelecture(Partie);
			FRelecture Relue;
			FString Erreur;
			Banc.Vrai(AnalyserRelecture(Texte, Relue, Erreur), TEXT("le texte produit se relit"));
			Banc.Vrai(RelecturesEgales(Partie, Relue), TEXT("la relecture relue est egale a l'originale"));
			Banc.Vrai(FormaterRelecture(Relue).Equals(Texte, ESearchCase::CaseSensitive), TEXT("le texte est le meme apres un aller-retour"));
			Banc.Vrai(Rejouer(Relue).bConforme, TEXT("la relecture relue est conforme"));

			// Relectures faussees : la divergence est trouvee, et au bon endroit.
			{
				FRelecture Faussee = Partie;
				Faussee.Config.Graine += 1;
				const FRapportRelecture Faux = Rejouer(Faussee);
				Banc.Vrai(!Faux.bConforme && Faux.PremiereDivergence == 0 && Faux.EmpreintesVerifiees == 0, TEXT("graine modifiee : divergence des l'etat initial"));
			}
			if (Partie.Empreintes.Num() > 5)
			{
				FRelecture Faussee = Partie;
				Faussee.Empreintes[5].Empreinte ^= 1;
				const FRapportRelecture Faux = Rejouer(Faussee);
				Banc.Vrai(!Faux.bConforme && Faux.PremiereDivergence == 500 && Faux.EmpreintesVerifiees == 5, TEXT("empreinte modifiee : divergence a son iteration"));
				Banc.Vrai(Faux.Recalculees.Num() == 6 && Faux.Recalculees[5].Iteration == 500 && Faux.Recalculees[5].Empreinte == Partie.Empreintes[5].Empreinte,
					TEXT("empreinte modifiee : l'empreinte recalculee est la vraie, pas celle du fichier"));
			}
			{
				FRelecture Faussee = Partie;
				Faussee.Commandes.Reset();
				const FRapportRelecture Faux = Rejouer(Faussee);
				Banc.Vrai(!Faux.bConforme && Faux.PremiereDivergence == 100 && Faux.EmpreintesVerifiees == 1, TEXT("commandes supprimees : divergence a la premiere empreinte suivante"));
			}
			{
				// Une creation de l'ouverture devient un ordre sans effet : les compteurs de l'etat en gardent la trace jusqu'au bout.
				// (Changer seulement la vitesse d'une escouade ne suffirait pas : si elle est retiree avant le releve suivant,
				// plus rien ne distingue les deux parties. Les empreintes ne sont comparees que tous les cent pas.)
				FRelecture Faussee = Partie;
				bool bModifiee = false;
				for (FCommande& Commande : Faussee.Commandes)
				{
					if (Commande.Type == ETypeCommande::CreerEscouade && Commande.Iteration == 0)
					{
						Commande.Type = ETypeCommande::Retirer;
						Commande.A = MAX_int32;
						bModifiee = true;
						break;
					}
				}
				const FRapportRelecture Faux = Rejouer(Faussee);
				Banc.Vrai(bModifiee && !Faux.bConforme && Faux.PremiereDivergence == 100 && Faux.EmpreintesVerifiees == 1,
					TEXT("une seule commande modifiee : divergence au releve suivant"));
			}

			// Relectures mal formees : refusees avec une explication, sans etre jouees.
			{
				FRelecture MalFormee = Partie;
				MalFormee.Version = VersionFormat + 1;
				const FRapportRelecture Faux = Rejouer(MalFormee);
				Banc.Vrai(!Faux.bConforme && !Faux.Erreur.IsEmpty(), TEXT("autre version refusee"));
			}
			{
				FRelecture MalFormee = Partie;
				MalFormee.Iterations = -1;
				Banc.Vrai(!Rejouer(MalFormee).bConforme, TEXT("duree negative refusee"));
			}
			if (Partie.Commandes.Num() > 1)
			{
				FRelecture MalFormee = Partie;
				MalFormee.Commandes.Swap(0, MalFormee.Commandes.Num() - 1);
				const FRapportRelecture Faux = Rejouer(MalFormee);
				Banc.Vrai(!Faux.bConforme && !Faux.Erreur.IsEmpty(), TEXT("commandes hors de l'ordre canonique refusees"));
			}
			{
				FRelecture MalFormee = Partie;
				MalFormee.Commandes.Add(Cmd(Partie.Iterations, 0, 4000000000u, Arreter, 1));
				const FRapportRelecture Faux = Rejouer(MalFormee);
				Banc.Vrai(!Faux.bConforme && !Faux.Erreur.IsEmpty(), TEXT("commande posterieure a la fin refusee"));
			}
			{
				FRelecture MalFormee = Partie;
				MalFormee.Empreintes.Reset();
				Banc.Vrai(!Rejouer(MalFormee).bConforme, TEXT("relecture sans empreinte refusee"));
			}
			if (Partie.Empreintes.Num() > 1)
			{
				FRelecture MalFormee = Partie;
				MalFormee.Empreintes.Pop();
				Banc.Vrai(!Rejouer(MalFormee).bConforme, TEXT("relecture sans empreinte finale refusee"));
			}
		}

		void TesterTexte(FBanc& Banc)
		{
			Banc.Section(TEXT("texte de relecture"));

			const FString Base =
				TEXT("pdr-relecture 1\n")
				TEXT("graine 5\n")
				TEXT("iterations 2\n")
				TEXT("cmd 0 0 0 1 10 20 30\n")
				TEXT("cmd 1 0 1 2 1 500 600\n")
				TEXT("empreinte 0 0123456789abcdef\n")
				TEXT("empreinte 2 fedcba9876543210\n")
				TEXT("fin\n");

			const auto Remplace = [&Base](const TCHAR* De, const TCHAR* Vers) -> FString
			{
				return Base.Replace(De, Vers, ESearchCase::CaseSensitive);
			};
			const auto Accepte = [&Banc](const FString& Texte, FRelecture& Sortie, const TCHAR* Quoi)
			{
				FString Raison;
				Banc.Vrai(AnalyserRelecture(Texte, Sortie, Raison) && Raison.IsEmpty(), Quoi);
			};
			const auto Refuse = [&Banc](const FString& Texte, const TCHAR* Quoi)
			{
				FRelecture Rejet;
				Rejet.Iterations = 123;
				FString Raison;
				const bool bAccepte = AnalyserRelecture(Texte, Rejet, Raison);
				Banc.Vrai(!bAccepte && !Raison.IsEmpty() && Rejet.Iterations == 123, Quoi);
			};

			FRelecture Lue;
			Accepte(Base, Lue, TEXT("texte de base accepte"));
			Banc.Vrai(Lue.Version == 1 && Lue.Config.Graine == 5 && Lue.Iterations == 2, TEXT("en-tete lu"));
			Banc.Vrai(Lue.Commandes.Num() == 2 && CommandesEgales(Lue.Commandes[1], Cmd(1, 0, 1, Deplacer, 1, 500, 600)), TEXT("commandes lues"));
			Banc.Vrai(Lue.Empreintes.Num() == 2 && Lue.Empreintes[0].Iteration == 0 && Lue.Empreintes[0].Empreinte == 0x0123456789abcdefull
				&& Lue.Empreintes[1].Iteration == 2 && Lue.Empreintes[1].Empreinte == 0xfedcba9876543210ull, TEXT("empreintes lues"));
			Banc.Vrai(FormaterRelecture(Lue).Equals(Base, ESearchCase::CaseSensitive), TEXT("le texte de base est le texte canonique"));

			FRelecture Tolere;
			Accepte(Base.Replace(TEXT("\n"), TEXT("\r\n"), ESearchCase::CaseSensitive), Tolere, TEXT("fins de ligne de Windows tolerees"));
			Banc.Vrai(RelecturesEgales(Lue, Tolere), TEXT("fins de ligne de Windows : meme relecture"));
			Accepte(Base.LeftChop(1), Tolere, TEXT("dernier saut de ligne absent tolere"));
			Banc.Vrai(RelecturesEgales(Lue, Tolere), TEXT("dernier saut de ligne absent : meme relecture"));
			const FString BaseWindows = Base.Replace(TEXT("\n"), TEXT("\r\n"), ESearchCase::CaseSensitive);
			Accepte(BaseWindows.LeftChop(2), Tolere, TEXT("fins de ligne de Windows sans la derniere : tolere"));
			Banc.Vrai(RelecturesEgales(Lue, Tolere), TEXT("fins de ligne de Windows sans la derniere : meme relecture"));
			Accepte(Remplace(TEXT("graine 5\n"), TEXT("graine 5\r\n")), Tolere, TEXT("une seule fin de ligne de Windows : toleree"));
			Banc.Vrai(RelecturesEgales(Lue, Tolere), TEXT("une seule fin de ligne de Windows : meme relecture"));

			FRelecture Extremes;
			Accepte(Remplace(TEXT("graine 5"), TEXT("graine 18446744073709551615")), Extremes, TEXT("plus grande graine acceptee"));
			Banc.Egal64(Extremes.Config.Graine, MAX_uint64, TEXT("plus grande graine lue"));
			Accepte(Remplace(TEXT("cmd 0 0 0 1 10 20 30"), TEXT("cmd 0 255 4294967295 1 -2147483648 2147483647 -1")), Extremes, TEXT("valeurs extremes d'une commande acceptees"));
			Banc.Vrai(Extremes.Commandes.Num() == 2 && CommandesEgales(Extremes.Commandes[0], Cmd(0, 255, 4294967295u, Creer, MIN_int32, MAX_int32, -1)),
				TEXT("valeurs extremes d'une commande lues"));

			Refuse(TEXT(""), TEXT("texte vide"));
			Refuse(TEXT("fin\n"), TEXT("texte reduit a la ligne de fin"));
			Refuse(Remplace(TEXT("pdr-relecture 1"), TEXT("pdr-relecture 2")), TEXT("version inconnue"));
			Refuse(Remplace(TEXT("pdr-relecture 1"), TEXT("PDR-RELECTURE 1")), TEXT("en-tete en majuscules"));
			Refuse(Remplace(TEXT("pdr-relecture 1\n"), TEXT("")), TEXT("en-tete absent"));
			Refuse(Remplace(TEXT("fin\n"), TEXT("")), TEXT("ligne de fin absente"));
			Refuse(Remplace(TEXT("fin\n"), TEXT("FIN\n")), TEXT("ligne de fin en majuscules"));
			Refuse(Base + TEXT("cmd 1 0 2 3 1 0 0\n"), TEXT("texte apres la fin"));
			Refuse(Base + TEXT("\n"), TEXT("ligne vide apres la fin"));
			Refuse(Remplace(TEXT("graine 5\n"), TEXT("graine 5\n\n")), TEXT("ligne vide au milieu"));
			Refuse(Remplace(TEXT("graine 5"), TEXT("graine -1")), TEXT("graine negative"));
			Refuse(Remplace(TEXT("graine 5"), TEXT("graine 18446744073709551616")), TEXT("graine trop grande"));
			Refuse(Remplace(TEXT("graine 5"), TEXT("graine 05")), TEXT("zero de tete"));
			Refuse(Remplace(TEXT("graine 5"), TEXT("graine  5")), TEXT("double espace"));
			Refuse(Remplace(TEXT("graine 5"), TEXT("graine")), TEXT("graine sans valeur"));
			Refuse(Remplace(TEXT("iterations 2"), TEXT("iterations +2")), TEXT("signe plus"));
			Refuse(Remplace(TEXT("iterations 2"), TEXT("iterations 2 ")), TEXT("espace en fin de ligne"));
			Refuse(Remplace(TEXT("iterations 2"), TEXT("iterations 2000000001")), TEXT("duree hors limite"));
			Refuse(Remplace(TEXT("cmd 0 0 0 1 10 20 30"), TEXT("cmd 0 0 0 1 10 20")), TEXT("commande a sept champs"));
			Refuse(Remplace(TEXT("cmd 0 0 0 1 10 20 30"), TEXT("cmd 0 0 0 1 10 20 30 40")), TEXT("commande a neuf champs"));
			Refuse(Remplace(TEXT("cmd 0 0 0 1 10 20 30"), TEXT("cmd 0 0 0 1 10 20 3x")), TEXT("nombre mal forme"));
			Refuse(Remplace(TEXT("cmd 0 0 0 1 10 20 30"), TEXT("cmd 0 256 0 1 10 20 30")), TEXT("joueur hors limite"));
			Refuse(Remplace(TEXT("cmd 0 0 0 1 10 20 30"), TEXT("cmd 0 0 0 0 10 20 30")), TEXT("type Aucune"));
			Refuse(Remplace(TEXT("cmd 0 0 0 1 10 20 30"), TEXT("cmd 0 0 0 5 10 20 30")), TEXT("type inconnu"));
			Refuse(Remplace(TEXT("cmd 0 0 0 1 10 20 30"), TEXT("cmd 0 0 4294967296 1 10 20 30")), TEXT("sequence trop grande"));
			Refuse(Remplace(TEXT("cmd 0 0 0 1 10 20 30"), TEXT("cmd 0 0 0 1 2147483648 20 30")), TEXT("valeur hors de 32 bits"));
			Refuse(Remplace(TEXT("cmd 0 0 0 1 10 20 30"), TEXT("cmd 0 0 0 1 -0 20 30")), TEXT("zero negatif"));
			Refuse(Remplace(TEXT("cmd 0 0 0 1 10 20 30"), TEXT("cmd -1 0 0 1 10 20 30")), TEXT("iteration negative"));
			Refuse(Remplace(TEXT("cmd 1 0 1 2 1 500 600"), TEXT("cmd 2 0 1 2 1 500 600")), TEXT("commande posterieure a la fin de la partie"));
			Refuse(Remplace(TEXT("cmd 0 0 0 1 10 20 30\ncmd 1 0 1 2 1 500 600\n"), TEXT("cmd 1 0 1 2 1 500 600\ncmd 0 0 0 1 10 20 30\n")), TEXT("commandes hors d'ordre"));
			Refuse(Remplace(TEXT("empreinte 0 0123456789abcdef"), TEXT("empreinte 0 0123456789ABCDEF")), TEXT("empreinte en majuscules"));
			Refuse(Remplace(TEXT("empreinte 0 0123456789abcdef"), TEXT("empreinte 0 123456789abcdef")), TEXT("empreinte a quinze chiffres"));
			Refuse(Remplace(TEXT("empreinte 0 0123456789abcdef"), TEXT("empreinte 0 0123456789abcdef0")), TEXT("empreinte a dix-sept chiffres"));
			Refuse(Remplace(TEXT("empreinte 0 0123456789abcdef\nempreinte 2 fedcba9876543210\n"), TEXT("empreinte 2 fedcba9876543210\nempreinte 0 0123456789abcdef\n")), TEXT("empreintes hors d'ordre"));
			Refuse(Remplace(TEXT("empreinte 2 fedcba9876543210\n"), TEXT("")), TEXT("empreinte finale absente"));
			Refuse(Remplace(TEXT("empreinte 0 0123456789abcdef\nempreinte 2 fedcba9876543210\n"), TEXT("")), TEXT("aucune empreinte"));
			Refuse(Remplace(TEXT("empreinte 2 fedcba9876543210\n"), TEXT("empreinte 2 fedcba9876543210\ncmd 1 0 2 3 1 0 0\n")), TEXT("commande apres les empreintes"));
			Refuse(Remplace(TEXT("empreinte 2 "), TEXT("empreinte 3 ")), TEXT("empreinte posterieure a la fin de la partie"));
			Refuse(Remplace(TEXT("cmd 0 0 0 1 10 20 30\n"), TEXT("ordre 0 0 0 1 10 20 30\n")), TEXT("ligne inconnue"));

			// Retours chariot : toleres devant un saut de ligne, nulle part ailleurs.
			Refuse(Base + TEXT("\r"), TEXT("retour chariot isole apres la fin"));
			Refuse(Base.LeftChop(1) + TEXT("\r"), TEXT("retour chariot sans saut de ligne en fin de texte"));
			Refuse(BaseWindows + TEXT("\r"), TEXT("retour chariot isole apres un texte a la mode de Windows"));
			Refuse(Remplace(TEXT("graine 5\n"), TEXT("graine 5\r\r\n")), TEXT("deux retours chariot devant un saut de ligne"));
			Refuse(Remplace(TEXT("graine 5\n"), TEXT("graine\r 5\n")), TEXT("retour chariot au milieu d'une ligne"));
			Refuse(Base.Replace(TEXT("\n"), TEXT("\r"), ESearchCase::CaseSensitive), TEXT("retours chariot seuls en guise de fins de ligne"));

			// Bornes des nombres, cote par cote.
			Refuse(Remplace(TEXT("cmd 0 0 0 1 10 20 30"), TEXT("cmd 0 0 0 1 18446744073709551615 20 30")), TEXT("valeur au-dela de 63 bits, qui se lirait -1"));
			Refuse(Remplace(TEXT("cmd 0 0 0 1 10 20 30"), TEXT("cmd 0 0 0 1 -2147483649 20 30")), TEXT("valeur sous 32 bits"));
			Refuse(Remplace(TEXT("cmd 0 0 0 1 10 20 30"), TEXT("cmd 0 -1 0 1 10 20 30")), TEXT("joueur negatif, qui se lirait 255"));
			Refuse(Remplace(TEXT("cmd 0 0 0 1 10 20 30"), TEXT("cmd 0 0 -1 1 10 20 30")), TEXT("rang negatif, qui se lirait 4294967295"));
			Refuse(Remplace(TEXT("cmd 0 0 0 1 10 20 30"), TEXT("cmd 0 0 0 -1 10 20 30")), TEXT("type negatif"));
			Refuse(Remplace(TEXT("cmd 0 0 0 1 10 20 30"), TEXT("cmd 0 0 0 256 10 20 30")), TEXT("type au-dela d'un octet"));
			Refuse(Remplace(TEXT("empreinte 0 0123456789abcdef"), TEXT("empreinte 0 0123456789abcdeg")), TEXT("empreinte avec une lettre hors de l'hexadecimal"));
			Refuse(Remplace(TEXT("empreinte 0 0123456789abcdef"), TEXT("empreinte 0 0123456789abcde/")), TEXT("empreinte avec le caractere qui precede le zero"));
			Refuse(Remplace(TEXT("empreinte 0 0123456789abcdef"), TEXT("empreinte 0 0123456789abcde:")), TEXT("empreinte avec le caractere qui suit le neuf"));
			Refuse(Remplace(TEXT("empreinte 0 0123456789abcdef"), TEXT("empreinte 0 0123456789abcde`")), TEXT("empreinte avec le caractere qui precede le a"));
			Refuse(Remplace(TEXT("empreinte 0 0123456789abcdef"), TEXT("empreinte 0 0123456789abcdef x")), TEXT("empreinte a quatre champs"));
			Refuse(Remplace(TEXT("empreinte 0 0123456789abcdef"), TEXT("empreinte 0")), TEXT("empreinte a deux champs"));
			Refuse(Remplace(TEXT("empreinte 0 "), TEXT("empreinte -1 ")), TEXT("empreinte d'une iteration negative"));

			// Propriete : tout texte accepte est, aux deux tolerances pres, le texte canonique de ce qu'il decrit.
			{
				const FString Alphabet = TEXT("0123456789 -\n\rabcdefgimnprt");
				FAlea Alea(404);
				int32 Acceptes = 0;
				bool bCanonique = true;
				for (int32 Essai = 0; Essai < 800; ++Essai)
				{
					FString Mute = (Essai % 2 == 0) ? Base : BaseWindows;
					const int32 Retouches = Alea.Entre(1, 2);
					for (int32 Rang = 0; Rang < Retouches; ++Rang)
					{
						const int32 Place = Alea.Entre(0, Mute.Len() - 1);
						const int32 Lettre = Alea.Entre(0, Alphabet.Len() - 1);
						const int32 Geste = Alea.Entre(0, 2);
						if (Geste == 0)
						{
							Mute[Place] = Alphabet[Lettre];
						}
						else if (Geste == 1)
						{
							Mute.InsertAt(Place, Alphabet[Lettre]);
						}
						else
						{
							Mute.RemoveAt(Place, 1);
						}
					}
					FRelecture Relue;
					FString Raison;
					if (AnalyserRelecture(Mute, Relue, Raison))
					{
						++Acceptes;
						FString Ramene = Mute.Replace(TEXT("\r\n"), TEXT("\n"), ESearchCase::CaseSensitive);
						if (!Ramene.EndsWith(TEXT("\n"), ESearchCase::CaseSensitive))
						{
							Ramene += TEXT("\n");
						}
						bCanonique = bCanonique && FormaterRelecture(Relue).Equals(Ramene, ESearchCase::CaseSensitive);
					}
				}
				Banc.Vrai(Acceptes > 0 && Acceptes < 800, TEXT("textes retouches au hasard : certains acceptes, certains refuses"));
				Banc.Vrai(bCanonique, TEXT("tout texte accepte est, aux tolerances pres, le texte canonique de sa lecture"));
			}
		}

		void TesterDeterminisme(FBanc& Banc)
		{
			Banc.Section(TEXT("determinisme"));

			const FString Premiere = FormaterRelecture(GenererPartie(11, 3000));
			const FString Seconde = FormaterRelecture(GenererPartie(11, 3000));
			Banc.Vrai(Premiere.Equals(Seconde, ESearchCase::CaseSensitive), TEXT("meme graine : meme partie, au caractere pres"));

			const FString Autre = FormaterRelecture(GenererPartie(12, 3000));
			Banc.Vrai(!Premiere.Equals(Autre, ESearchCase::CaseSensitive), TEXT("autre graine : autre partie"));

			// Une partie plus longue contient la plus courte : ses premieres empreintes sont les memes.
			const FRelecture Longue = GenererPartie(11, 3000);
			const FRelecture Debut = GenererPartie(11, 1500);
			bool bMemeDebut = Debut.Empreintes.Num() == 16 && Longue.Empreintes.Num() == 31;
			for (int32 Rang = 0; bMemeDebut && Rang < 16; ++Rang)
			{
				bMemeDebut = Debut.Empreintes[Rang].Iteration == Longue.Empreintes[Rang].Iteration
					&& Debut.Empreintes[Rang].Empreinte == Longue.Empreintes[Rang].Empreinte;
			}
			Banc.Vrai(bMemeDebut, TEXT("la duree demandee ne change pas le debut de la partie"));

			// Parties temoins : memes valeurs que le modele independant. Elles doivent rester les memes sur toute machine.
			// Le texte entier et l'etat apres chaque iteration sont compares, pas seulement l'etat final :
			// un ecart qui se resorbe avant la fin, ou un champ de commande mal ecrit, se voit.
			const uint64 Graines[3] = { 1, 2, MAX_uint64 };
			const int32 Durees[3] = { 1000, 250, 500 };
			const int32 NombresDeCommandes[3] = { 339, 90, 157 };
			const int32 NombresDEmpreintes[3] = { 11, 4, 6 };
			const uint64 Finales[3] = { 0x1e982ae299d8c86cull, 0x2fd31c83b1aa929dull, 0x6cf1ebe6bf72b876ull };
			const int32 LongueursDuTexte[3] = { 10420, 2797, 4906 };
			const uint64 Textes[3] = { 0x4220265be8923558ull, 0xb753872936ea7c11ull, 0xbfaa468a191ffb83ull };
			const uint64 ChaqueIteration[3] = { 0xb46d09e4f7c86028ull, 0x381afd6fbfd1ddf9ull, 0x0682585cd314e6ceull };
			for (int32 Rang = 0; Rang < 3; ++Rang)
			{
				const FRelecture Temoin = GenererPartie(Graines[Rang], Durees[Rang]);
				Banc.EgalEntier(Temoin.Commandes.Num(), NombresDeCommandes[Rang], TEXT("partie temoin : nombre de commandes"));
				Banc.EgalEntier(Temoin.Empreintes.Num(), NombresDEmpreintes[Rang], TEXT("partie temoin : nombre d'empreintes"));
				if (Temoin.Empreintes.Num() > 0)
				{
					Banc.Egal64(Temoin.Empreintes.Last().Empreinte, Finales[Rang], TEXT("partie temoin : empreinte finale du modele independant"));
				}
				const FString TexteTemoin = FormaterRelecture(Temoin);
				Banc.EgalEntier(TexteTemoin.Len(), LongueursDuTexte[Rang], TEXT("partie temoin : longueur du texte"));
				Banc.Egal64(EmpreinteDuTexte(TexteTemoin), Textes[Rang], TEXT("partie temoin : texte entier, celui du modele independant"));
				Banc.Egal64(EmpreintesDeChaqueIteration(Temoin), ChaqueIteration[Rang], TEXT("partie temoin : etat apres chaque iteration, celui du modele independant"));
			}

			// La premiere partie temoin contient des commandes que seul leur contenu departage.
			{
				const FRelecture Temoin = GenererPartie(1, 1000);
				int32 MemesCles = 0;
				for (int32 Rang = 1; Rang < Temoin.Commandes.Num(); ++Rang)
				{
					const FCommande& Avant = Temoin.Commandes[Rang - 1];
					const FCommande& Apres = Temoin.Commandes[Rang];
					MemesCles += (Avant.Iteration == Apres.Iteration && Avant.Joueur == Apres.Joueur && Avant.Sequence == Apres.Sequence) ? 1 : 0;
				}
				Banc.EgalEntier(MemesCles, 3, TEXT("partie temoin : trois commandes de meme cle que la precedente"));
			}
		}
	}

	FResultatTests ExecuterTests()
	{
		FResultatTests Resultat;
		FBanc Banc(Resultat);
		TesterAlea(Banc);
		TesterOctets(Banc);
		TesterEmpreinteEtRacine(Banc);
		TesterDeplacement(Banc);
		TesterCommandes(Banc);
		TesterLimites(Banc);
		TesterOrdreCanonique(Banc);
		TesterComparateurs(Banc);
		TesterReference(Banc);
		TesterSauvegarde(Banc);
		TesterEnregistreur(Banc);
		TesterRelecture(Banc);
		TesterTexte(Banc);
		TesterDeterminisme(Banc);
		return Resultat;
	}
}
