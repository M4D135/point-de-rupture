#pragma once

#include "CoreMinimal.h"

namespace Pdr
{
	/** Generateur aleatoire deterministe (SplitMix64). Meme graine, meme suite, sur toute machine. */
	class FAlea
	{
	public:
		explicit FAlea(uint64 Graine = 0) : Etat(Graine) {}

		uint64 Suivant64()
		{
			Etat += 0x9E3779B97F4A7C15ull;
			uint64 Z = Etat;
			Z = (Z ^ (Z >> 30)) * 0xBF58476D1CE4E5B9ull;
			Z = (Z ^ (Z >> 27)) * 0x94D049BB133111EBull;
			return Z ^ (Z >> 31);
		}

		/** Entier dans [Min, Max], bornes comprises. Si Max <= Min, rend Min sans consommer de tirage. */
		int32 Entre(int32 Min, int32 Max)
		{
			if (Max <= Min)
			{
				return Min;
			}
			const uint64 Etendue = static_cast<uint64>(static_cast<int64>(Max) - static_cast<int64>(Min)) + 1;
			return static_cast<int32>(static_cast<int64>(Min) + static_cast<int64>(Suivant64() % Etendue));
		}

		uint64 LireEtat() const { return Etat; }
		void EcrireEtat(uint64 NouvelEtat) { Etat = NouvelEtat; }

	private:
		uint64 Etat;
	};
}
