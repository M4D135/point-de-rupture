using UnrealBuildTool;

// Module de jeu de POINT DE RUPTURE : entrees, affichage, son.
// Aucune regle de jeu ici : elles vivent dans PdrSim.
public class PointDeRupture : ModuleRules
{
	public PointDeRupture(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[] { "Core", "CoreUObject", "Engine", "InputCore", "PdrSim" });
	}
}
