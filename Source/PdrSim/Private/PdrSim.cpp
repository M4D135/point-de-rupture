#include "PdrSim.h"

#include "Modules/ModuleManager.h"
#include "PdrTypes.h"

IMPLEMENT_MODULE(FDefaultModuleImpl, PdrSim);

namespace Pdr
{
	int32 VersionSimulation()
	{
		return VersionFormat;
	}
}
