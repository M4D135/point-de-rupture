#include "PdrExecuteur.h"

#include "Misc/Parse.h"
#include "Misc/Paths.h"
#include "PdrTypes.h"

namespace PdrOutils
{
	namespace
	{
		/** Un jeton de la ligne de commande qui commence par un tiret : '-nom' ou '-nom=valeur'. */
		struct FCommutateur
		{
			FString Nom;
			FString Valeur;
			bool bValeur = false;
		};

		/**
		 * Decoupe la ligne en jetons separes par des blancs et garde ceux qui commencent par un tiret, doublons compris.
		 * Une valeur va jusqu'a la fin de son jeton : ni virgule ni parenthese ne la coupent, et une valeur vide reste vide.
		 */
		void Decouper(const FString& Ligne, TArray<FCommutateur>& Commutateurs)
		{
			const TCHAR* Curseur = *Ligne;
			FString Jeton;
			while (*Curseur != TEXT('\0'))
			{
				// Rend faux pour un jeton vide (deux guillemets accoles) : on passe au suivant, sans s'arreter la.
				FParse::Token(Curseur, Jeton, false);
				if (Jeton.Len() < 2 || Jeton[0] != TEXT('-'))
				{
					continue;
				}
				FCommutateur Commutateur;
				int32 Egal = INDEX_NONE;
				if (Jeton.FindChar(TEXT('='), Egal))
				{
					Commutateur.Nom = Jeton.Mid(1, Egal - 1);
					Commutateur.Valeur = Jeton.RightChop(Egal + 1);
					Commutateur.bValeur = true;
					// Le lanceur du moteur met entre guillemets une valeur qui contient un blanc : -nom="a b".
					const int32 Longueur = Commutateur.Valeur.Len();
					if (Longueur >= 2 && Commutateur.Valeur[0] == TEXT('"') && Commutateur.Valeur[Longueur - 1] == TEXT('"'))
					{
						Commutateur.Valeur = Commutateur.Valeur.Mid(1, Longueur - 2);
					}
				}
				else
				{
					Commutateur.Nom = Jeton.Mid(1);
				}
				Commutateurs.Add(MoveTemp(Commutateur));
			}
		}

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

		/** Seize chiffres hexadecimaux en minuscules, comme les condenses affiches. */
		bool LireHexa16(const FString& Texte, uint64& Valeur)
		{
			if (Texte.Len() != 16)
			{
				return false;
			}
			uint64 Cumul = 0;
			for (int32 Indice = 0; Indice < 16; ++Indice)
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
					return false;
				}
			}
			Valeur = Cumul;
			return true;
		}

		/** Lecture d'une ligne decoupee : chaque option du projet y figure au plus une fois. */
		class FLectureDesOptions
		{
		public:
			FLectureDesOptions(const TArray<FCommutateur>& InCommutateurs, TArray<FString>& InFautes)
				: Commutateurs(InCommutateurs), Fautes(InFautes)
			{
			}

			/** Option sans valeur : '-nom'. */
			void Drapeau(const TCHAR* Nom, bool& bPresente)
			{
				const FCommutateur* Trouve = Chercher(Nom);
				if (Trouve == nullptr)
				{
					return;
				}
				if (Trouve->bValeur)
				{
					Fautes.Add(FString::Printf(TEXT("-%s=%s refusee : cette option ne prend pas de valeur"), Nom, *Trouve->Valeur));
					return;
				}
				bPresente = true;
			}

			/** Option '-nom=entier', dans [Min, Max]. */
			void Entier(const TCHAR* Nom, uint64 Min, uint64 Max, bool& bPresente, uint64& Valeur)
			{
				const FCommutateur* Trouve = ChercherAvecValeur(Nom);
				if (Trouve == nullptr)
				{
					return;
				}
				uint64 Lue = 0;
				if (!LireChiffres(Trouve->Valeur, Lue) || Lue < Min || Lue > Max)
				{
					Fautes.Add(FString::Printf(TEXT("-%s=%s refusee : entier de %llu a %llu attendu"), Nom, *Trouve->Valeur, Min, Max));
					return;
				}
				bPresente = true;
				Valeur = Lue;
			}

			/** Option '-nom=entier' dont la borne haute tient dans 31 bits. */
			void Entier32(const TCHAR* Nom, uint64 Min, uint64 Max, bool& bPresente, int32& Valeur)
			{
				check(Max <= static_cast<uint64>(MAX_int32));
				uint64 Large = 0;
				bool bLue = false;
				Entier(Nom, Min, Max, bLue, Large);
				if (bLue)
				{
					bPresente = true;
					Valeur = static_cast<int32>(Large);
				}
			}

			/** Option '-nom=condense' : seize chiffres hexadecimaux en minuscules. */
			void Condense(const TCHAR* Nom, bool& bPresente, uint64& Valeur)
			{
				const FCommutateur* Trouve = ChercherAvecValeur(Nom);
				if (Trouve == nullptr)
				{
					return;
				}
				uint64 Lue = 0;
				if (!LireHexa16(Trouve->Valeur, Lue))
				{
					Fautes.Add(FString::Printf(TEXT("-%s=%s refusee : seize chiffres hexadecimaux en minuscules attendus"), Nom, *Trouve->Valeur));
					return;
				}
				bPresente = true;
				Valeur = Lue;
			}

			/** Option '-nom=chemin' : un chemin absolu, avec cette fin de nom si Extension n'est pas vide. */
			void Chemin(const TCHAR* Nom, const TCHAR* Extension, bool& bPresente, FString& Valeur)
			{
				const FCommutateur* Trouve = ChercherAvecValeur(Nom);
				if (Trouve == nullptr)
				{
					return;
				}
				if (Trouve->Valeur.IsEmpty() || FPaths::IsRelative(Trouve->Valeur))
				{
					Fautes.Add(FString::Printf(TEXT("-%s=%s refusee : chemin absolu attendu"), Nom, *Trouve->Valeur));
					return;
				}
				if (Extension[0] != TEXT('\0') && !Trouve->Valeur.EndsWith(Extension, ESearchCase::CaseSensitive))
				{
					Fautes.Add(FString::Printf(TEXT("-%s=%s refusee : le nom du fichier doit finir par %s"), Nom, *Trouve->Valeur, Extension));
					return;
				}
				bPresente = true;
				Valeur = Trouve->Valeur;
			}

		private:
			/** Le commutateur de ce nom, ou rien. Une faute est notee s'il figure plusieurs fois. */
			const FCommutateur* Chercher(const TCHAR* Nom)
			{
				const FCommutateur* Trouve = nullptr;
				for (const FCommutateur& Commutateur : Commutateurs)
				{
					if (!Commutateur.Nom.Equals(Nom, ESearchCase::IgnoreCase))
					{
						continue;
					}
					if (Trouve != nullptr)
					{
						Fautes.Add(FString::Printf(TEXT("-%s donnee plusieurs fois"), Nom));
						return nullptr;
					}
					Trouve = &Commutateur;
				}
				return Trouve;
			}

			const FCommutateur* ChercherAvecValeur(const TCHAR* Nom)
			{
				const FCommutateur* Trouve = Chercher(Nom);
				if (Trouve != nullptr && !Trouve->bValeur)
				{
					Fautes.Add(FString::Printf(TEXT("-%s refusee : une valeur est attendue, sous la forme -%s=valeur"), Nom, Nom));
					return nullptr;
				}
				return Trouve;
			}

			const TArray<FCommutateur>& Commutateurs;
			TArray<FString>& Fautes;
		};
	}

	bool LireOptions(const FString& LigneDeCommande, FOptions& Options, TArray<FString>& Fautes)
	{
		Options = FOptions();
		Fautes.Reset();

		TArray<FCommutateur> Commutateurs;
		Decouper(LigneDeCommande, Commutateurs);
		FLectureDesOptions Lecture(Commutateurs, Fautes);

		Lecture.Drapeau(TEXT("tests"), Options.bTests);
		Lecture.Entier32(TEXT("boucle"), 1, BoucleMax, Options.bBoucle, Options.Boucle);
		Lecture.Entier32(TEXT("escouades"), 0, static_cast<uint64>(Pdr::EscouadesMax), Options.bEscouades, Options.Escouades);
		Lecture.Entier32(TEXT("charge"), 1, ChargeMax, Options.bCharge, Options.Charge);
		Lecture.Entier32(TEXT("commandes"), 0, CommandesParIterationMax, Options.bCommandes, Options.CommandesParIteration);
		Lecture.Entier32(TEXT("file"), 1, static_cast<uint64>(Pdr::CommandesEnAttenteMax), Options.bFile, Options.File);
		Lecture.Entier32(TEXT("relectures"), 1, PartiesMax, Options.bRelectures, Options.Parties);
		Lecture.Entier32(TEXT("iterations"), 0, IterationsOutilMax, Options.bIterations, Options.Iterations);
		Lecture.Entier(TEXT("graine"), 0, MAX_uint64, Options.bGraine, Options.Graine);
		Lecture.Condense(TEXT("attendu"), Options.bAttendu, Options.Attendu);
		Lecture.Chemin(TEXT("dossier"), TEXT(""), Options.bDossier, Options.Dossier);
		Lecture.Chemin(TEXT("enregistrer"), TEXT(".pdr"), Options.bEnregistrer, Options.Enregistrer);
		Lecture.Chemin(TEXT("relire"), TEXT(""), Options.bRelire, Options.Relire);

		// Une option sans l'action qui s'en sert n'aurait aucun effet : mieux vaut le dire que rendre un succes trompeur.
		const auto Exiger = [&Fautes](bool bOption, bool bAction, const TCHAR* Option, const TCHAR* Actions)
		{
			if (bOption && !bAction)
			{
				Fautes.Add(FString::Printf(TEXT("-%s refusee : sans effet sans %s"), Option, Actions));
			}
		};
		Exiger(Options.bEscouades, Options.bBoucle || Options.bCharge, TEXT("escouades"), TEXT("-boucle ou -charge"));
		Exiger(Options.bCommandes, Options.bCharge, TEXT("commandes"), TEXT("-charge"));
		Exiger(Options.bIterations, Options.bRelectures || Options.bEnregistrer, TEXT("iterations"), TEXT("-relectures ou -enregistrer"));
		Exiger(Options.bGraine, Options.bEnregistrer, TEXT("graine"), TEXT("-enregistrer"));
		Exiger(Options.bDossier, Options.bRelectures, TEXT("dossier"), TEXT("-relectures"));
		Exiger(Options.bAttendu, Options.bRelectures || Options.bRelire, TEXT("attendu"), TEXT("-relectures ou -relire"));

		return Fautes.Num() == 0;
	}

	void TrierNomsDeParties(TArray<FString>& Noms)
	{
		Noms.Sort([](const FString& G, const FString& D) { return G.Compare(D, ESearchCase::CaseSensitive) < 0; });
	}

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

	bool FBilanDeRelecture::Ajouter(const FString& Texte, FString& Motif)
	{
		++NombreFichiers;
		Pdr::FRelecture Partie;
		if (!Pdr::AnalyserRelecture(Texte, Partie, Motif))
		{
			return false;
		}
		const Pdr::FRapportRelecture Rapport = Pdr::Rejouer(Partie);
		// Les empreintes recalculees ici, pas celles du texte : le condense depend de ce que cette machine a calcule.
		Condenser(Octets, Partie, Rapport.Recalculees);
		if (!Rapport.bConforme)
		{
			Motif = FString::Printf(TEXT("divergence a l'iteration %d, %d empreintes verifiees %s"),
				Rapport.PremiereDivergence, Rapport.EmpreintesVerifiees, *Rapport.Erreur);
			return false;
		}
		++NombreConformes;
		Motif.Reset();
		return true;
	}

	void FBilanDeRelecture::AjouterIllisible()
	{
		++NombreFichiers;
	}

	uint64 FBilanDeRelecture::Condense() const
	{
		return Pdr::Fnv1a64(Octets.Lire());
	}
}
