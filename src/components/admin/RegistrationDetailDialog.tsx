import type { RegistrationData, EventFormField } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Printer, Pencil, UserMinus, Package, RotateCcw } from "lucide-react";
import { getFieldValue } from "@/components/DynamicFieldFilters";

interface FixedDetail {
  label: string;
  getValue: (r: RegistrationData) => string;
}

interface Props {
  registration: RegistrationData | null;
  onClose: () => void;
  customFields: EventFormField[];
  fixedDetails: FixedDetail[];
  onEdit: (reg: RegistrationData) => void;
  onPrint: (reg: RegistrationData) => void;
  onUnmarkPrinted: (reg: RegistrationData) => void;
  onToggleMaterial: (reg: RegistrationData, deliver: boolean) => void;
  onUncheckin: (reg: RegistrationData) => void;
  printing: boolean;
}

export default function RegistrationDetailDialog({
  registration,
  onClose,
  customFields,
  fixedDetails,
  onEdit,
  onPrint,
  onUnmarkPrinted,
  onToggleMaterial,
  onUncheckin,
  printing,
}: Props) {
  const selectedReg = registration;
  return (
    <Dialog open={!!selectedReg} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">Ficha do Inscrito</DialogTitle>
        </DialogHeader>
        {selectedReg && (
          <>
            <div className="flex flex-wrap gap-2 pb-3 border-b border-border">
              <Button size="sm" variant="outline" onClick={() => { onEdit(selectedReg); }} className="gap-1.5">
                <Pencil className="h-3.5 w-3.5" /> Editar dados
              </Button>
              <Button size="sm" variant="outline" onClick={() => onPrint(selectedReg)} disabled={printing} className="gap-1.5">
                <Printer className="h-3.5 w-3.5" /> Imprimir etiqueta
              </Button>
              {selectedReg.label_printed_at && (
                <Button size="sm" variant="outline" onClick={() => onUnmarkPrinted(selectedReg)} className="gap-1.5">
                  <RotateCcw className="h-3.5 w-3.5" /> Marcar como não impresso
                </Button>
              )}
              {selectedReg.material_delivered_at ? (
                <Button size="sm" variant="outline" onClick={() => onToggleMaterial(selectedReg, false)} className="gap-1.5">
                  <RotateCcw className="h-3.5 w-3.5" /> Reverter material
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => onToggleMaterial(selectedReg, true)} className="gap-1.5">
                  <Package className="h-3.5 w-3.5" /> Marcar material entregue
                </Button>
              )}
              {selectedReg.checkin_status === "checked_in" && (
                <Button size="sm" variant="destructive" onClick={() => onUncheckin(selectedReg)} className="gap-1.5">
                  <UserMinus className="h-3.5 w-3.5" /> Descredenciar
                </Button>
              )}
            </div>
            <div className="space-y-1">
              {fixedDetails.map(({ label, getValue }) => {
                const val = getValue(selectedReg);
                if (val === "—" && !["Nome completo", "E-mail", "CPF", "Código de inscrição", "Tipo", "Status pagamento", "Check-in", "Data da inscrição"].includes(label)) return null;
                return (
                  <div key={label} className="flex justify-between gap-4 border-b border-border/50 py-2.5">
                    <span className="text-sm font-medium text-muted-foreground">{label}</span>
                    <span className="text-sm text-foreground text-right">{val}</span>
                  </div>
                );
              })}
              {customFields.map(f => {
                const val = getFieldValue(selectedReg, f.field_key);
                if (!val) return null;
                return (
                  <div key={f.field_key} className="flex justify-between gap-4 border-b border-border/50 py-2.5">
                    <span className="text-sm font-medium text-muted-foreground">{f.field_label}</span>
                    <span className="text-sm text-foreground text-right">{val}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
