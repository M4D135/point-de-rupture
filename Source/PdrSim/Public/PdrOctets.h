#pragma once

#include "CoreMinimal.h"

namespace Pdr
{
	/** Ecrit des entiers dans un tampon, octet de poids faible en premier, quelle que soit la machine. */
	class FEcrivain
	{
	public:
		void U8(uint8 Valeur) { Octets.Add(Valeur); }

		void U32(uint32 Valeur)
		{
			for (int32 Rang = 0; Rang < 4; ++Rang)
			{
				Octets.Add(static_cast<uint8>((Valeur >> (8 * Rang)) & 0xFFu));
			}
		}

		void I32(int32 Valeur) { U32(static_cast<uint32>(Valeur)); }

		void U64(uint64 Valeur)
		{
			for (int32 Rang = 0; Rang < 8; ++Rang)
			{
				Octets.Add(static_cast<uint8>((Valeur >> (8 * Rang)) & 0xFFull));
			}
		}

		const TArray<uint8>& Lire() const { return Octets; }

	private:
		TArray<uint8> Octets;
	};

	/** Relit ce que FEcrivain a ecrit. Toute lecture hors du tampon rend 0 et fait passer Ok() a faux. */
	class FLecteur
	{
	public:
		FLecteur(const uint8* InDonnees, int32 InTaille) : Donnees(InDonnees), Taille(InTaille < 0 ? 0 : InTaille) {}
		explicit FLecteur(const TArray<uint8>& Tampon) : Donnees(Tampon.GetData()), Taille(Tampon.Num()) {}

		uint8 U8()
		{
			if (Position >= Taille)
			{
				bOk = false;
				return 0;
			}
			return Donnees[Position++];
		}

		uint32 U32()
		{
			uint32 Valeur = 0;
			for (int32 Rang = 0; Rang < 4; ++Rang)
			{
				Valeur |= static_cast<uint32>(U8()) << (8 * Rang);
			}
			return Valeur;
		}

		int32 I32() { return static_cast<int32>(U32()); }

		uint64 U64()
		{
			uint64 Valeur = 0;
			for (int32 Rang = 0; Rang < 8; ++Rang)
			{
				Valeur |= static_cast<uint64>(U8()) << (8 * Rang);
			}
			return Valeur;
		}

		/** Faux des qu'une lecture a depasse la fin du tampon. */
		bool Ok() const { return bOk; }

		/** Vrai quand tout le tampon a ete lu, sans depassement. */
		bool Fini() const { return bOk && Position == Taille; }

	private:
		const uint8* Donnees;
		int32 Taille;
		int32 Position = 0;
		bool bOk = true;
	};

	/** Empreinte FNV-1a sur 64 bits. */
	PDRSIM_API uint64 Fnv1a64(const uint8* Donnees, int32 Taille);

	inline uint64 Fnv1a64(const TArray<uint8>& Tampon)
	{
		return Fnv1a64(Tampon.GetData(), Tampon.Num());
	}
}
