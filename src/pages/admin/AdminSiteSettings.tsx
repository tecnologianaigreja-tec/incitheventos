import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { Save, Upload, Image } from "lucide-react";

interface SiteSettings {
  id: string;
  header_type: "color" | "banner";
  header_color: string;
  header_title: string;
  header_subtitle: string;
  header_banner_url: string | null;
  footer_text: string;
}

export default function AdminSiteSettings() {
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("site_settings")
        .select("*")
        .limit(1)
        .single();
      if (data) setSettings(data as unknown as SiteSettings);
      setLoading(false);
    }
    load();
  }, []);

  async function handleBannerUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !settings) return;
    setUploading(true);

    const ext = file.name.split(".").pop();
    const path = `site-header/banner-${Date.now()}.${ext}`;

    const { error } = await supabase.storage
      .from("event-banners")
      .upload(path, file, { upsert: true });

    if (error) {
      toast.error("Erro ao enviar banner");
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage
      .from("event-banners")
      .getPublicUrl(path);

    setSettings({ ...settings, header_banner_url: urlData.publicUrl });
    setUploading(false);
    toast.success("Banner enviado!");
  }

  async function handleSave() {
    if (!settings) return;
    setSaving(true);

    const { error } = await supabase
      .from("site_settings")
      .update({
        header_type: settings.header_type,
        header_color: settings.header_color,
        header_title: settings.header_title,
        header_subtitle: settings.header_subtitle,
        header_banner_url: settings.header_banner_url,
        footer_text: settings.footer_text,
        updated_at: new Date().toISOString(),
      })
      .eq("id", settings.id);

    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar configurações");
    } else {
      toast.success("Configurações salvas!");
    }
  }

  if (loading || !settings) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-xl font-bold text-foreground">Configurações do Site</h2>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" /> {saving ? "Salvando..." : "Salvar"}
        </Button>
      </div>

      {/* Header Config */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cabeçalho da Página de Eventos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Título</Label>
            <Input
              value={settings.header_title}
              onChange={(e) => setSettings({ ...settings, header_title: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Subtítulo</Label>
            <Input
              value={settings.header_subtitle}
              onChange={(e) => setSettings({ ...settings, header_subtitle: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label>Tipo de cabeçalho</Label>
            <RadioGroup
              value={settings.header_type}
              onValueChange={(v) => setSettings({ ...settings, header_type: v as "color" | "banner" })}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="color" id="type-color" />
                <Label htmlFor="type-color">Cor sólida</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="banner" id="type-banner" />
                <Label htmlFor="type-banner">Banner (imagem)</Label>
              </div>
            </RadioGroup>
          </div>

          {settings.header_type === "color" && (
            <div className="space-y-2">
              <Label>Cor HSL (ex: 220 60% 22%)</Label>
              <Input
                value={settings.header_color}
                onChange={(e) => setSettings({ ...settings, header_color: e.target.value })}
                placeholder="220 60% 22%"
              />
              <div
                className="h-16 rounded-md border"
                style={{ backgroundColor: `hsl(${settings.header_color})` }}
              />
            </div>
          )}

          {settings.header_type === "banner" && (
            <div className="space-y-3">
              <Label>Banner (recomendado: 1440×300 px)</Label>
              <div className="flex items-center gap-3">
                <Button variant="outline" asChild disabled={uploading} className="gap-2">
                  <label className="cursor-pointer">
                    <Upload className="h-4 w-4" />
                    {uploading ? "Enviando..." : "Enviar banner"}
                    <input type="file" accept="image/*" className="hidden" onChange={handleBannerUpload} />
                  </label>
                </Button>
              </div>
              {settings.header_banner_url && (
                <div className="overflow-hidden rounded-md border">
                  <img src={settings.header_banner_url} alt="Preview do banner" className="h-32 w-full object-cover" />
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Footer */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rodapé</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Texto do rodapé</Label>
            <Input
              value={settings.footer_text}
              onChange={(e) => setSettings({ ...settings, footer_text: e.target.value })}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
