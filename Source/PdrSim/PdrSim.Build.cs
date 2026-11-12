using UnrealBuildTool;

// Module de simulation de POINT DE RUPTURE.
// Regle d'architecture (CONTRE-EXPERTISE.md, section 8.1) : ce module ne depend que de Core.
// Ni acteur, ni objet Unreal, ni rendu : il doit rester testable sans lancer le jeu.
public class PdrSim : ModuleRules
{
	public PdrSim(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[] { "Core" });
	}
}
