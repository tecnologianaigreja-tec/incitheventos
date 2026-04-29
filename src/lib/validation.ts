import { isValidCPF, isValidEmail, isValidPhone } from "@/lib/constants";
import type { ParticipantForm } from "@/lib/types";

export function validateParticipant(p: ParticipantForm): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!p.full_name.trim()) errors.full_name = "Nome obrigatório";
  if (p.email.trim() && !isValidEmail(p.email)) errors.email = "E-mail inválido";
  if (!p.cpf.trim()) errors.cpf = "CPF obrigatório";
  else if (!isValidCPF(p.cpf)) errors.cpf = "CPF inválido";
  if (!p.phone.trim()) errors.phone = "Telefone obrigatório";
  else if (!isValidPhone(p.phone)) errors.phone = "Telefone inválido";
  if (!p.area) errors.area = "Selecione uma área";
  if (!p.congregation.trim()) errors.congregation = "Congregação obrigatória";
  if (!p.church_role) errors.church_role = "Selecione um cargo";
  if (!p.church_function) errors.church_function = "Selecione uma função";
  return errors;
}

export function emptyParticipant(): ParticipantForm {
  return {
    full_name: "",
    email: "",
    phone: "",
    cpf: "",
    birth_date: "",
    area: "",
    congregation: "",
    church_role: "",
    church_function: "",
  };
}
