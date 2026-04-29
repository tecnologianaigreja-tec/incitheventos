export interface EventData {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  banner_url: string | null;
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  location_name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  workload_hours: number | null;
  organizer_name: string | null;
  unit_price_cents: number;
  max_participants: number | null;
  status: "draft" | "published" | "closed" | "canceled";
  // Landing page content
  hero_badge: string | null;
  about_title: string | null;
  about_description: string | null;
  target_audience: TargetAudienceItem[];
  includes_items: string[];
  faq_items: FaqItem[];
  cta_title: string | null;
  cta_description: string | null;
  pricing_label: string | null;
  created_at: string;
  updated_at: string;
}

export interface TargetAudienceItem {
  title: string;
  description: string;
  icon: string;
}

export interface FaqItem {
  question: string;
  answer: string;
}

export interface EventFormField {
  id: string;
  event_id: string;
  field_label: string;
  field_key: string;
  field_type: "text" | "select" | "date" | "phone" | "email" | "cpf" | "textarea";
  is_required: boolean;
  placeholder: string | null;
  options: string[];
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface OrderData {
  id: string;
  event_id: string;
  order_code: string;
  order_nsu: string | null;
  purchase_type: "individual" | "batch";
  buyer_name: string;
  buyer_email: string;
  buyer_phone: string | null;
  buyer_document: string;
  buyer_is_participant: boolean;
  participants_count: number;
  unit_price_cents: number;
  total_price_cents: number;
  payment_provider: string | null;
  payment_status: "pending" | "approved" | "refused" | "canceled" | "expired" | "refunded";
  payment_link: string | null;
  payment_provider_reference: string | null;
  invoice_slug?: string | null;
  redirect_status_last_seen: string | null;
  webhook_status_last_seen: string | null;
  paid_at: string | null;
  canceled_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RegistrationData {
  id: string;
  event_id: string;
  order_id: string;
  registration_code: string;
  full_name: string;
  email: string;
  phone: string | null;
  cpf: string;
  birth_date: string | null;
  area: string | null;
  congregation: string | null;
  church_role: string | null;
  church_function: string | null;
  consent_terms: boolean;
  consent_data_usage: boolean;
  registration_type: "individual" | "batch";
  registration_status: "pending_payment" | "confirmed" | "canceled" | "invalidated";
  payment_status: "pending" | "approved" | "refused" | "canceled" | "expired" | "refunded";
  qr_token: string | null;
  qr_generated_at: string | null;
  checkin_status: "not_checked_in" | "checked_in";
  checkin_at: string | null;
  checkin_by_user_id: string | null;
  certificate_status: "unavailable" | "available" | "issued";
  certificate_issued_at: string | null;
  label_printed_at: string | null;
  label_printed_by: string | null;
  label_print_count: number;
  material_delivered_at: string | null;
  material_delivered_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CertificateData {
  id: string;
  registration_id: string;
  certificate_code: string;
  validation_hash: string;
  pdf_url: string | null;
  issued_at: string;
  created_at: string;
  updated_at: string;
}

export interface ParticipantForm {
  full_name: string;
  email: string;
  phone: string;
  cpf: string;
  birth_date: string;
  area: string;
  congregation: string;
  church_role: string;
  church_function: string;
  [key: string]: string; // Allow dynamic custom fields
}

export interface IndividualRegistrationForm {
  participant: ParticipantForm;
  consent_terms: boolean;
  consent_data_usage: boolean;
}

export interface BatchRegistrationForm {
  buyer: ParticipantForm;
  buyer_is_participant: boolean;
  participants: ParticipantForm[];
  consent_terms: boolean;
  consent_data_usage: boolean;
}
