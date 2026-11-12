using UnrealBuildTool;

// Module de simulation de POINT DE RUPTURE.
// Regle d'architecture (CONTRE-EXPERTISE.md, section 8.1) : ce module ne depend que de Core.
// Ni acteur, ni objet Unreal, ni rendu : il doit rester testable sans lancer le jeu.
public class PdrSim : ModuleRules
{
	public PdrSim(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		// Le noyau ne calcule qu'en entiers : une conversion implicite d'un nombre a virgule en entier, que le
		// compilateur laisse passer en silence par defaut, devient ici une erreur. Un transtypage explicite passe
		// toujours : les autres garde-fous sont dans Outils/verifier.py (sources et objets compiles).
		CppCompileWarningSettings.UnsafeTypeCastWarningLevel = WarningLevel.Error;

		PublicDependencyModuleNames.AddRange(new string[] { "Core" });
	}
}
