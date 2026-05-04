import { useState } from "react";
import type { EventFormField, RegistrationData } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Filter, X, ChevronDown } from "lucide-react";

interface ActiveFilter {
  fieldKey: string;
  fieldLabel: string;
  value: string; // For multi-select, values are joined with "||"
  values?: string[]; // Array of selected values
}

interface DynamicFieldFiltersProps {
  customFields: EventFormField[];
  activeFilters: ActiveFilter[];
  onFiltersChange: (filters: ActiveFilter[]) => void;
}

// Known field mappings for filtering
export const KNOWN_FIELD_MAP: Record<string, keyof RegistrationData> = {
  phone: "phone", telefone: "phone",
  birth_date: "birth_date", data_nascimento: "birth_date",
  congregation: "congregation", congregacao: "congregation",
  area: "area",
  church_role: "church_role", funcao_eclesiastica: "church_role",
  church_function: "church_function", cargo_igreja: "church_function",
};

function normalizeKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function resolveKnownField(fieldKey: string): keyof RegistrationData | undefined {
  const normalized = normalizeKey(fieldKey);

  if (KNOWN_FIELD_MAP[fieldKey]) return KNOWN_FIELD_MAP[fieldKey];

  if (normalized.includes("area")) return "area";
  if (normalized.includes("congreg")) return "congregation";
  if (normalized.includes("depart") || normalized.includes("cargo") || normalized.includes("ministerio")) return "church_role";
  if (normalized.includes("funcao") || normalized.includes("funcoministerial") || normalized.includes("funcaoministerial")) return "church_function";
  if (normalized.includes("telefone") || normalized.includes("whatsapp") || normalized.includes("celular")) return "phone";
  if (normalized.includes("datanascimento") || normalized.includes("birthdate")) return "birth_date";

  return undefined;
}

function findInCustomFields(customFields: Record<string, any>, fieldKey: string): string {
  // Literal match (with trim tolerance)
  for (const [key, value] of Object.entries(customFields)) {
    if (value == null || value === "") continue;
    if (key === fieldKey || key.trim() === fieldKey.trim()) return String(value);
  }

  const normalizedTarget = normalizeKey(fieldKey);

  for (const [key, value] of Object.entries(customFields)) {
    if (value == null || value === "") continue;
    const normalizedKey = normalizeKey(key.trim());
    if (normalizedKey === normalizedTarget || normalizedKey.includes(normalizedTarget) || normalizedTarget.includes(normalizedKey)) {
      return String(value);
    }
  }

  return "";
}

export function getFieldValue(reg: RegistrationData, fieldKey: string): string {
  // 1. custom_fields PRIMEIRO (fonte de verdade dos formulários dinâmicos)
  const cf = ((reg as any).custom_fields && typeof (reg as any).custom_fields === "object") ? (reg as any).custom_fields : {};
  const fromCustom = findInCustomFields(cf, fieldKey);
  if (fromCustom) return fromCustom;

  // 2. Fallback: coluna fixa via resolver semântico
  const knownField = resolveKnownField(fieldKey);
  if (knownField) {
    const directValue = (reg[knownField] as string) || "";
    if (directValue) return directValue;
  }
  if ((reg as any)[fieldKey]) return (reg as any)[fieldKey];
  return "";
}

export function applyDynamicFilters(registrations: RegistrationData[], filters: ActiveFilter[]): RegistrationData[] {
  if (filters.length === 0) return registrations;
  return registrations.filter(r => {
    return filters.every(f => {
      const val = getFieldValue(r, f.fieldKey).toLowerCase();
      if (f.values && f.values.length > 0) {
        return f.values.some(v => val === v.toLowerCase());
      }
      return val.includes(f.value.toLowerCase());
    });
  });
}

export default function DynamicFieldFilters({ customFields, activeFilters, onFiltersChange }: DynamicFieldFiltersProps) {
  const [selectedField, setSelectedField] = useState<string>("");
  const [filterValue, setFilterValue] = useState<string>("");
  const [selectedValues, setSelectedValues] = useState<string[]>([]);
  const [popoverOpen, setPopoverOpen] = useState(false);

  const selectedFieldDef = customFields.find(f => f.field_key === selectedField);
  const hasOptions = selectedFieldDef?.field_type === "select" && Array.isArray(selectedFieldDef.options) && selectedFieldDef.options.length > 0;

  function toggleValue(opt: string) {
    setSelectedValues(prev =>
      prev.includes(opt) ? prev.filter(v => v !== opt) : [...prev, opt]
    );
  }

  function addFilter() {
    if (!selectedField) return;
    const fieldDef = customFields.find(f => f.field_key === selectedField);
    const label = fieldDef?.field_label || selectedField;

    if (hasOptions) {
      if (selectedValues.length === 0) return;
      onFiltersChange([
        ...activeFilters,
        { fieldKey: selectedField, fieldLabel: label, value: selectedValues.join("||"), values: [...selectedValues] },
      ]);
      setSelectedValues([]);
    } else {
      if (!filterValue) return;
      onFiltersChange([
        ...activeFilters,
        { fieldKey: selectedField, fieldLabel: label, value: filterValue },
      ]);
      setFilterValue("");
    }
    setSelectedField("");
    setPopoverOpen(false);
  }

  function removeFilter(index: number) {
    onFiltersChange(activeFilters.filter((_, i) => i !== index));
  }

  function handleFieldChange(v: string) {
    setSelectedField(v);
    setFilterValue("");
    setSelectedValues([]);
  }

  const canApply = hasOptions ? selectedValues.length > 0 : !!filterValue;
  const hasSelectionInProgress = !!selectedField || !!filterValue || selectedValues.length > 0;

  function clearSelection() {
    setSelectedField("");
    setFilterValue("");
    setSelectedValues([]);
    setPopoverOpen(false);
  }

  function clearAll() {
    clearSelection();
    onFiltersChange([]);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            <Filter className="inline h-3 w-3 mr-1" />Filtrar por campo
          </label>
          <Select value={selectedField} onValueChange={handleFieldChange}>
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
              <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-between font-normal">
                    <span className="truncate text-left">
                      {selectedValues.length === 0
                        ? "Selecione valores..."
                        : `${selectedValues.length} selecionado${selectedValues.length > 1 ? "s" : ""}`}
                    </span>
                    <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-2 max-h-60 overflow-y-auto" align="start">
                  <div className="space-y-1">
                    {(selectedFieldDef!.options as string[]).map(opt => (
                      <label
                        key={opt}
                        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer hover:bg-muted transition-colors"
                      >
                        <Checkbox
                          checked={selectedValues.includes(opt)}
                          onCheckedChange={() => toggleValue(opt)}
                        />
                        <span>{opt}</span>
                      </label>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
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

        {selectedField && canApply && (
          <Button onClick={addFilter} size="sm" className="gap-1">
            <Filter className="h-3 w-3" /> Aplicar
          </Button>
        )}

        {hasSelectionInProgress && (
          <Button
            onClick={clearSelection}
            variant="ghost"
            size="sm"
            className="gap-1 text-muted-foreground"
            aria-label="Limpar seleção"
            title="Limpar seleção em curso"
          >
            <X className="h-3 w-3" /> Limpar
          </Button>
        )}

        {(activeFilters.length > 0 || hasSelectionInProgress) && (
          <Button
            onClick={clearAll}
            variant="ghost"
            size="sm"
            className="gap-1 text-muted-foreground"
            aria-label="Limpar todos os filtros"
            title="Limpar todos os filtros"
          >
            <X className="h-3 w-3" /> Limpar tudo
          </Button>
        )}
      </div>

      {activeFilters.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {activeFilters.map((f, i) => (
            <Badge key={i} variant="secondary" className="gap-1 pl-3 pr-1 py-1">
              <span className="text-xs font-medium">{f.fieldLabel}:</span>
              <span className="text-xs">
                {f.values ? f.values.join(", ") : f.value}
              </span>
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
