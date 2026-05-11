import { useState } from "react";
import type { RegistrationData } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileDown, Loader2 } from "lucide-react";
import type { GroupField, GroupScope } from "@/lib/groupedReportPdf";

interface ExtraColumn { key: string; label: string; getValue: (r: RegistrationData) => string }

interface Props {
  generalReportOpen: boolean;
  onGeneralReportOpenChange: (open: boolean) => void;
  groupedReportOpen: boolean;
  onGroupedReportOpenChange: (open: boolean) => void;
  extraFixedColumns: ExtraColumn[];
  dynamicExtraColumns: ExtraColumn[];
  groupFixedFields: GroupField[];
  dynamicGroupFields: GroupField[];
  generatingReport: boolean;
  onDownloadReport: (extraCols: Set<string>) => void;
  onDownloadGroupedReport: (groupByKey: string, subGroupByKey: string, scope: GroupScope) => void;
}

export default function ReportDialogs({
  generalReportOpen,
  onGeneralReportOpenChange,
  groupedReportOpen,
  onGroupedReportOpenChange,
  extraFixedColumns,
  dynamicExtraColumns,
  groupFixedFields,
  dynamicGroupFields,
  generatingReport,
  onDownloadReport,
  onDownloadGroupedReport,
}: Props) {
  const [selectedExtraCols, setSelectedExtraCols] = useState<Set<string>>(new Set());
  const [groupByKey, setGroupByKey] = useState<string>("");
  const [subGroupByKey, setSubGroupByKey] = useState<string>("__none__");
  const [groupScope, setGroupScope] = useState<GroupScope>("all");

  return (
    <>
      <Dialog open={generalReportOpen} onOpenChange={onGeneralReportOpenChange}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">Relatório geral — colunas</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-2">
                Colunas padrão (sempre incluídas):
              </p>
              <div className="flex flex-wrap gap-2">
                {["Nome", "E-mail", "CPF", "Pagamento", "Check-in"].map(c => (
                  <Badge key={c} variant="secondary">{c}</Badge>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium mb-2">Adicionar colunas extras:</p>
              <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                {[...extraFixedColumns, ...dynamicExtraColumns].map(c => (
                  <label key={c.key} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={selectedExtraCols.has(c.key)}
                      onCheckedChange={(v) => {
                        setSelectedExtraCols(prev => {
                          const next = new Set(prev);
                          if (v) next.add(c.key); else next.delete(c.key);
                          return next;
                        });
                      }}
                    />
                    <span>{c.label}</span>
                  </label>
                ))}
              </div>
              {selectedExtraCols.size > 5 && (
                <p className="text-xs text-muted-foreground mt-2">
                  Dica: muitas colunas podem reduzir o tamanho do texto. O PDF mudará para paisagem automaticamente.
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => onGeneralReportOpenChange(false)} disabled={generatingReport}>
                Cancelar
              </Button>
              <Button
                onClick={() => onDownloadReport(selectedExtraCols)}
                disabled={generatingReport}
                className="gap-2"
              >
                {generatingReport ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                Gerar PDF
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={groupedReportOpen} onOpenChange={onGroupedReportOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">Relatório quantitativo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium">Agrupar por *</Label>
              <Select value={groupByKey} onValueChange={setGroupByKey}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Escolha um campo" /></SelectTrigger>
                <SelectContent>
                  {[...groupFixedFields, ...dynamicGroupFields].map(f => (
                    <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm font-medium">Sub-agrupar por (opcional)</Label>
              <Select value={subGroupByKey} onValueChange={setSubGroupByKey}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Nenhum" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nenhum</SelectItem>
                  {[...groupFixedFields, ...dynamicGroupFields]
                    .filter(f => f.key !== groupByKey)
                    .map(f => (
                      <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm font-medium">Considerar</Label>
              <RadioGroup value={groupScope} onValueChange={(v) => setGroupScope(v as GroupScope)} className="mt-1.5 space-y-1.5">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <RadioGroupItem value="all" id="scope-all" />
                  Todos os inscritos (filtros aplicados)
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <RadioGroupItem value="confirmed" id="scope-confirmed" />
                  Apenas confirmados
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <RadioGroupItem value="paid" id="scope-paid" />
                  Apenas pagos
                </label>
              </RadioGroup>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => onGroupedReportOpenChange(false)} disabled={generatingReport}>
                Cancelar
              </Button>
              <Button
                onClick={() => onDownloadGroupedReport(groupByKey, subGroupByKey, groupScope)}
                disabled={generatingReport || !groupByKey}
                className="gap-2"
              >
                {generatingReport ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                Gerar PDF
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
