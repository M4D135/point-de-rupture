using UnrealBuildTool;

// Outils de l'editeur : tests du noyau de simulation et executeur sans affichage (-run=PdrSim).
// Rien de ce module ne part dans le jeu.
public class PdrOutils : ModuleRules
{
	public PdrOutils(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[] { "Core", "CoreUObject", "Engine", "PdrSim" });
	}
}
