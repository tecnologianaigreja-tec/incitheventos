// Landing page template definitions with color palettes
export interface LandingTemplate {
  id: string;
  name: string;
  description: string;
  // CSS variable overrides (HSL values)
  colors: {
    primary: string;
    primaryForeground: string;
    accent: string;
    accentForeground: string;
    secondary: string;
    secondaryForeground: string;
  };
}

export const LANDING_TEMPLATES: LandingTemplate[] = [
  {
    id: "classic",
    name: "Clássico",
    description: "Azul marinho e dourado — elegante e tradicional",
    colors: {
      primary: "220 60% 22%",
      primaryForeground: "40 30% 96%",
      accent: "32 80% 50%",
      accentForeground: "40 30% 98%",
      secondary: "35 40% 90%",
      secondaryForeground: "220 25% 15%",
    },
  },
  {
    id: "modern",
    name: "Moderno",
    description: "Cinza escuro e ciano — clean e contemporâneo",
    colors: {
      primary: "210 15% 16%",
      primaryForeground: "180 20% 96%",
      accent: "175 65% 45%",
      accentForeground: "210 15% 8%",
      secondary: "180 15% 92%",
      secondaryForeground: "210 15% 15%",
    },
  },
  {
    id: "elegant",
    name: "Elegante",
    description: "Bordô e creme — sofisticado e acolhedor",
    colors: {
      primary: "345 55% 28%",
      primaryForeground: "30 40% 96%",
      accent: "30 60% 55%",
      accentForeground: "345 55% 12%",
      secondary: "30 30% 92%",
      secondaryForeground: "345 40% 20%",
    },
  },
  {
    id: "vibrant",
    name: "Vibrante",
    description: "Roxo e laranja — dinâmico e energético",
    colors: {
      primary: "260 50% 30%",
      primaryForeground: "40 30% 97%",
      accent: "24 90% 55%",
      accentForeground: "260 50% 10%",
      secondary: "260 20% 93%",
      secondaryForeground: "260 40% 20%",
    },
  },
  {
    id: "nature",
    name: "Natural",
    description: "Verde floresta e terra — orgânico e sereno",
    colors: {
      primary: "155 45% 20%",
      primaryForeground: "80 25% 96%",
      accent: "38 65% 50%",
      accentForeground: "155 45% 10%",
      secondary: "80 20% 92%",
      secondaryForeground: "155 35% 18%",
    },
  },
];

export function getTemplateById(id: string): LandingTemplate {
  return LANDING_TEMPLATES.find(t => t.id === id) || LANDING_TEMPLATES[0];
}

export function getTemplateStyles(template: LandingTemplate): React.CSSProperties {
  return {
    "--lp-primary": template.colors.primary,
    "--lp-primary-foreground": template.colors.primaryForeground,
    "--lp-accent": template.colors.accent,
    "--lp-accent-foreground": template.colors.accentForeground,
    "--lp-secondary": template.colors.secondary,
    "--lp-secondary-foreground": template.colors.secondaryForeground,
  } as React.CSSProperties;
}
