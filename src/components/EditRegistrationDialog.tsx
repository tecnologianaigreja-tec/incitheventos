import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RegistrationData, EventFormField } from "@/lib/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { formatPhone } from "@/lib/constants";
import { Loader2 } from "lucide-react";

interface Props {
  registration: RegistrationData | null;
  customFields: EventFormField[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export default function EditRegistrationDialog({ registration, customFields, open, onOpenChange, onSaved }: Props) {
  const [form, setForm] = useState<Record<string, any>>({});
  const [customFieldsValues, setCustomFieldsValues] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (registration) {
      setForm({
        full_name: registration.full_name || "",
        phone: registration.phone || "",
        birth_date: registration.birth_date || "",
      });
      setCustomFieldsValues({ ...((registration as any).custom_fields || {}) });
    }
  }, [registration]);

  if (!registration) return null;

  const update = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  async function handleSave() {
    if (!form.full_name?.trim()) {
      toast.error("Nome completo é obrigatório");
      return;
    }
    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();

    const before = {
      full_name: registration.full_name,
      phone: registration.phone,
      birth_date: registration.birth_date,
      custom_fields: (registration as any).custom_fields || {},
    };

    const after = {
      full_name: form.full_name.trim(),
      phone: form.phone?.trim() || null,
      birth_date: form.birth_date || null,
      custom_fields: customFieldsValues,
    };

    const { error } = await supabase
      .from("registrations")
      .update(after)
      .eq("id", registration.id);

    if (error) {
      toast.error("Erro ao salvar alterações");
      setSaving(false);
      return;
    }

    await supabase.from("audit_logs").insert({
      action: "registration_edited",
      entity_type: "registration",
      entity_id: registration.id,
      actor_id: user?.id ?? null,
      details: { before, after } as any,
    });

    toast.success("Inscrito atualizado!");
    setSaving(false);
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">Editar inscrito</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Nome completo *</Label>
            <Input value={form.full_name || ""} onChange={(e) => update("full_name", e.target.value)} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>CPF (não editável)</Label>
              <Input value={registration.cpf} readOnly disabled />
            </div>
            <div>
              <Label>E-mail (não editável)</Label>
              <Input value={registration.email} readOnly disabled />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Telefone</Label>
              <Input
                value={form.phone || ""}
                onChange={(e) => update("phone", formatPhone(e.target.value))}
                maxLength={15}
              />
            </div>
            <div>
              <Label>Data de nascimento</Label>
              <Input type="date" value={form.birth_date || ""} onChange={(e) => update("birth_date", e.target.value)} />
            </div>
          </div>

          {customFields.length > 0 && (
            <div className="space-y-3 border-t border-border pt-4">
              <p className="text-sm font-medium text-muted-foreground">Campos personalizados</p>
              {customFields.map((f) => (
                <div key={f.field_key}>
                  <Label>{f.field_label}</Label>
                  {f.field_type === "select" ? (
                    <Select
                      value={customFieldsValues[f.field_key] || ""}
                      onValueChange={(v) => setCustomFieldsValues((s) => ({ ...s, [f.field_key]: v }))}
                    >
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {(f.options || []).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      type={f.field_type === "date" ? "date" : "text"}
                      value={customFieldsValues[f.field_key] || ""}
                      onChange={(e) => setCustomFieldsValues((s) => ({ ...s, [f.field_key]: e.target.value }))}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar alterações"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
