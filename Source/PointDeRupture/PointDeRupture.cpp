#include "PointDeRupture.h"

#include "Modules/ModuleManager.h"
#include "PdrSim.h"

DEFINE_LOG_CATEGORY_STATIC(LogPointDeRupture, Log, All);

/** Module de jeu. Au chargement, il ecrit une ligne au journal : elle prouve que les deux modules sont lies. */
class FPointDeRuptureModule : public FDefaultGameModuleImpl
{
public:
	virtual void StartupModule() override
	{
		UE_LOG(LogPointDeRupture, Display, TEXT("POINT DE RUPTURE : module de jeu charge, simulation version %d"), Pdr::VersionSimulation());
	}
};

IMPLEMENT_PRIMARY_GAME_MODULE(FPointDeRuptureModule, PointDeRupture, "PointDeRupture");
