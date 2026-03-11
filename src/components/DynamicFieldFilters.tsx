import { useState } from "react";
import type { EventFormField, RegistrationData } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Filter, X } from "lucide-react";

interface ActiveFilter {
  fieldKey: string;
  fieldLabel: string;
  value: string;
}

interface DynamicFieldFiltersProps {
  customFields: EventFormField[];
  activeFilters: ActiveFilter[];
  onFiltersChange: (filters: ActiveFilter[]) => void;
}

// Known field mappings for filtering
const KNOWN_FIELD_MAP: Record<string, keyof RegistrationData> = {
  phone: "phone", telefone: "phone",
  birth_date: "birth_date", data_nascimento: "birth_date",
  congregation: "congregation", congregacao: "congregation",
  area: "area",
  church_role: "church_role", funcao_eclesiastica: "church_role",
  church_function: "church_function", cargo_igreja: "church_function",
};

export function getFieldValue(reg: RegistrationData, fieldKey: string): string {
  if (KNOWN_FIELD_MAP[fieldKey]) return (reg[KNOWN_FIELD_MAP[fieldKey]] as string) || "";
  return (reg as any)[fieldKey] || "";
}

export function applyDynamicFilters(registrations: RegistrationData[], filters: ActiveFilter[]): RegistrationData[] {
  if (filters.length === 0) return registrations;
  return registrations.filter(r => {
    return filters.every(f => {
      const val = getFieldValue(r, f.fieldKey).toLowerCase();
      return val.includes(f.value.toLowerCase());
    });
  });
}

export default function DynamicFieldFilters({ customFields, activeFilters, onFiltersChange }: DynamicFieldFiltersProps) {
  const [selectedField, setSelectedField] = useState<string>("");
  const [filterValue, setFilterValue] = useState<string>("");

  const selectedFieldDef = customFields.find(f => f.field_key === selectedField);
  const hasOptions = selectedFieldDef?.field_type === "select" && Array.isArray(selectedFieldDef.options) && selectedFieldDef.options.length > 0;

  function addFilter() {
    if (!selectedField || !filterValue) return;
    const fieldDef = customFields.find(f => f.field_key === selectedField);
    onFiltersChange([
      ...activeFilters,
      { fieldKey: selectedField, fieldLabel: fieldDef?.field_label || selectedField, value: filterValue },
    ]);
    setSelectedField("");
    setFilterValue("");
  }

  function removeFilter(index: number) {
    onFiltersChange(activeFilters.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            <Filter className="inline h-3 w-3 mr-1" />Filtrar por campo
          </label>
          <Select value={selectedField} onValueChange={(v) => { setSelectedField(v); setFilterValue(""); }}>
            <SelectTrigger><SelectValue placeholder="Selecione um campo..." /></SelectTrigger>
            <SelectContent>
              {customFields.map(f => (
                <SelectItem key={f.field_key} value={f.field_key}>{f.field_label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedField && (
          <div className="flex-1">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Valor</label>
            {hasOptions ? (
              <Select value={filterValue} onValueChange={setFilterValue}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {(selectedFieldDef!.options as string[]).map(opt => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={filterValue}
                onChange={e => setFilterValue(e.target.value)}
                placeholder="Digite o valor..."
                onKeyDown={e => e.key === "Enter" && addFilter()}
              />
            )}
          </div>
        )}

        {selectedField && filterValue && (
          <Button onClick={addFilter} size="sm" className="gap-1">
            <Filter className="h-3 w-3" /> Aplicar
          </Button>
        )}
      </div>

      {activeFilters.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {activeFilters.map((f, i) => (
            <Badge key={i} variant="secondary" className="gap-1 pl-3 pr-1 py-1">
              <span className="text-xs font-medium">{f.fieldLabel}:</span>
              <span className="text-xs">{f.value}</span>
              <button
                onClick={() => removeFilter(i)}
                className="ml-1 rounded-full p-0.5 hover:bg-muted-foreground/20 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          <Button variant="ghost" size="sm" onClick={() => onFiltersChange([])} className="h-6 text-xs text-muted-foreground">
            Limpar filtros
          </Button>
        </div>
      )}
    </div>
  );
}

export type { ActiveFilter };
