import { useState } from "react";
import type { ParticipantForm } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AREAS, CHURCH_ROLES, CHURCH_FUNCTIONS, formatCPF, formatPhone } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { isIOS } from "@/hooks/use-mobile";

const isIOSDevice = isIOS();

interface Props {
  value: ParticipantForm;
  onChange: (v: ParticipantForm) => void;
  index?: number;
  label?: string;
  errors?: Record<string, string>;
}

export default function ParticipantFormFields({ value, onChange, index, label, errors = {} }: Props) {
  const prefix = index !== undefined ? `p${index}_` : "";
  const title = label || (index !== undefined ? `Participante ${index + 1}` : "Dados do Participante");

  const update = (field: keyof ParticipantForm, val: string) => {
    onChange({ ...value, [field]: val });
  };

  return (
    <div className="space-y-4 rounded-lg border border-border/50 bg-card p-6">
      <h3 className="font-serif text-lg font-semibold text-foreground">{title}</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor={`${prefix}full_name`}>Nome completo *</Label>
          <Input
            id={`${prefix}full_name`}
            value={value.full_name}
            onChange={(e) => update("full_name", e.target.value)}
            placeholder="Nome completo"
            className={errors.full_name ? "border-destructive" : ""}
          />
          {errors.full_name && <p className="mt-1 text-xs text-destructive">{errors.full_name}</p>}
        </div>
        <div>
          <Label htmlFor={`${prefix}cpf`}>CPF *</Label>
          <Input
            id={`${prefix}cpf`}
            value={value.cpf}
            onChange={(e) => update("cpf", formatCPF(e.target.value))}
            placeholder="000.000.000-00"
            maxLength={14}
            className={errors.cpf ? "border-destructive" : ""}
          />
          {errors.cpf && <p className="mt-1 text-xs text-destructive">{errors.cpf}</p>}
        </div>
        <div>
          <Label htmlFor={`${prefix}email`}>E-mail *</Label>
          <Input
            id={`${prefix}email`}
            type="email"
            value={value.email}
            onChange={(e) => update("email", e.target.value)}
            placeholder="seu@email.com"
            className={errors.email ? "border-destructive" : ""}
          />
          {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email}</p>}
        </div>
        <div>
          <Label htmlFor={`${prefix}phone`}>Telefone / WhatsApp *</Label>
          <Input
            id={`${prefix}phone`}
            value={value.phone}
            onChange={(e) => update("phone", formatPhone(e.target.value))}
            placeholder="(00) 00000-0000"
            maxLength={15}
            className={errors.phone ? "border-destructive" : ""}
          />
          {errors.phone && <p className="mt-1 text-xs text-destructive">{errors.phone}</p>}
        </div>
        <div>
          <Label htmlFor={`${prefix}birth_date`}>Data de nascimento</Label>
          <Input
            id={`${prefix}birth_date`}
            type="date"
            value={value.birth_date}
            onChange={(e) => update("birth_date", e.target.value)}
          />
        </div>
        <div>
          <Label>Área *</Label>
          <Select value={value.area} onValueChange={(v) => update("area", v)}>
            <SelectTrigger className={errors.area ? "border-destructive" : ""}>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {AREAS.map((a) => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.area && <p className="mt-1 text-xs text-destructive">{errors.area}</p>}
        </div>
        <div>
          <Label htmlFor={`${prefix}congregation`}>Congregação *</Label>
          <Input
            id={`${prefix}congregation`}
            value={value.congregation}
            onChange={(e) => update("congregation", e.target.value)}
            placeholder="Nome da congregação"
            className={errors.congregation ? "border-destructive" : ""}
          />
          {errors.congregation && <p className="mt-1 text-xs text-destructive">{errors.congregation}</p>}
        </div>
        <div>
          <Label>Cargo *</Label>
          <Select value={value.church_role} onValueChange={(v) => update("church_role", v)}>
            <SelectTrigger className={errors.church_role ? "border-destructive" : ""}>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {CHURCH_ROLES.map((r) => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.church_role && <p className="mt-1 text-xs text-destructive">{errors.church_role}</p>}
        </div>
        <div>
          <Label>Função na igreja *</Label>
          <Select value={value.church_function} onValueChange={(v) => update("church_function", v)}>
            <SelectTrigger className={errors.church_function ? "border-destructive" : ""}>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {CHURCH_FUNCTIONS.map((f) => (
                <SelectItem key={f} value={f}>{f}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.church_function && <p className="mt-1 text-xs text-destructive">{errors.church_function}</p>}
        </div>
      </div>
    </div>
  );
}
