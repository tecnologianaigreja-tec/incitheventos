import { useState } from "react";
import type { ParticipantForm } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AREAS, CHURCH_ROLES, CHURCH_FUNCTIONS, formatCPF, formatPhone } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { isTouchDevice } from "@/hooks/use-mobile";

const isMobileTouch = isTouchDevice();

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

  const renderSelect = (label: string, val: string, onChangeFn: (v: string) => void, options: string[], errorKey: string) => {
    if (isMobileTouch) {
      return (
        <div>
          <Label>{label}</Label>
          <select
            value={val}
            onChange={e => onChangeFn(e.target.value)}
            className={cn(
              "flex h-10 w-full items-center rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
              errors[errorKey] ? "border-destructive" : ""
            )}
          >
            <option value="">Selecione</option>
            {options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          {errors[errorKey] && <p className="mt-1 text-xs text-destructive">{errors[errorKey]}</p>}
        </div>
      );
    }
    return (
      <div>
        <Label>{label}</Label>
        <Select value={val} onValueChange={onChangeFn}>
          <SelectTrigger className={errors[errorKey] ? "border-destructive" : ""}>
            <SelectValue placeholder="Selecione" />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
        {errors[errorKey] && <p className="mt-1 text-xs text-destructive">{errors[errorKey]}</p>}
      </div>
    );
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
        {renderSelect("Área *", value.area, (v) => update("area", v), AREAS, "area")}
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
        {renderSelect("Cargo *", value.church_role, (v) => update("church_role", v), CHURCH_ROLES, "church_role")}
        {renderSelect("Função na igreja *", value.church_function, (v) => update("church_function", v), CHURCH_FUNCTIONS, "church_function")}
      </div>
    </div>
  );
}
