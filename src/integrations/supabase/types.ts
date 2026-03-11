export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      admin_users: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string
          role: Database["public"]["Enums"]["admin_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          name: string
          role?: Database["public"]["Enums"]["admin_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string
          role?: Database["public"]["Enums"]["admin_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
        }
        Relationships: []
      }
      certificates: {
        Row: {
          certificate_code: string
          created_at: string
          id: string
          issued_at: string
          pdf_url: string | null
          registration_id: string
          updated_at: string
          validation_hash: string
        }
        Insert: {
          certificate_code: string
          created_at?: string
          id?: string
          issued_at?: string
          pdf_url?: string | null
          registration_id: string
          updated_at?: string
          validation_hash: string
        }
        Update: {
          certificate_code?: string
          created_at?: string
          id?: string
          issued_at?: string
          pdf_url?: string | null
          registration_id?: string
          updated_at?: string
          validation_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "certificates_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: true
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      checkin_logs: {
        Row: {
          action_type: Database["public"]["Enums"]["checkin_action_type"]
          checked_at: string
          checked_by_user_id: string | null
          id: string
          notes: string | null
          registration_id: string
        }
        Insert: {
          action_type?: Database["public"]["Enums"]["checkin_action_type"]
          checked_at?: string
          checked_by_user_id?: string | null
          id?: string
          notes?: string | null
          registration_id: string
        }
        Update: {
          action_type?: Database["public"]["Enums"]["checkin_action_type"]
          checked_at?: string
          checked_by_user_id?: string | null
          id?: string
          notes?: string | null
          registration_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkin_logs_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      event_form_fields: {
        Row: {
          created_at: string
          event_id: string
          field_key: string
          field_label: string
          field_type: string
          id: string
          is_active: boolean
          is_required: boolean
          options: Json | null
          placeholder: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_id: string
          field_key: string
          field_label: string
          field_type?: string
          id?: string
          is_active?: boolean
          is_required?: boolean
          options?: Json | null
          placeholder?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          field_key?: string
          field_label?: string
          field_type?: string
          id?: string
          is_active?: boolean
          is_required?: boolean
          options?: Json | null
          placeholder?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_form_fields_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          about_description: string | null
          about_title: string | null
          address: string | null
          banner_url: string | null
          city: string | null
          created_at: string
          cta_description: string | null
          cta_title: string | null
          description: string | null
          end_date: string
          end_time: string | null
          faq_items: Json | null
          hero_badge: string | null
          id: string
          includes_items: Json | null
          location_name: string | null
          max_participants: number | null
          organizer_name: string | null
          pricing_label: string | null
          slug: string
          start_date: string
          start_time: string | null
          state: string | null
          status: Database["public"]["Enums"]["event_status"]
          subtitle: string | null
          target_audience: Json | null
          template: string
          title: string
          unit_price_cents: number
          updated_at: string
          workload_hours: number | null
        }
        Insert: {
          about_description?: string | null
          about_title?: string | null
          address?: string | null
          banner_url?: string | null
          city?: string | null
          created_at?: string
          cta_description?: string | null
          cta_title?: string | null
          description?: string | null
          end_date: string
          end_time?: string | null
          faq_items?: Json | null
          hero_badge?: string | null
          id?: string
          includes_items?: Json | null
          location_name?: string | null
          max_participants?: number | null
          organizer_name?: string | null
          pricing_label?: string | null
          slug: string
          start_date: string
          start_time?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["event_status"]
          subtitle?: string | null
          target_audience?: Json | null
          template?: string
          title: string
          unit_price_cents?: number
          updated_at?: string
          workload_hours?: number | null
        }
        Update: {
          about_description?: string | null
          about_title?: string | null
          address?: string | null
          banner_url?: string | null
          city?: string | null
          created_at?: string
          cta_description?: string | null
          cta_title?: string | null
          description?: string | null
          end_date?: string
          end_time?: string | null
          faq_items?: Json | null
          hero_badge?: string | null
          id?: string
          includes_items?: Json | null
          location_name?: string | null
          max_participants?: number | null
          organizer_name?: string | null
          pricing_label?: string | null
          slug?: string
          start_date?: string
          start_time?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["event_status"]
          subtitle?: string | null
          target_audience?: Json | null
          template?: string
          title?: string
          unit_price_cents?: number
          updated_at?: string
          workload_hours?: number | null
        }
        Relationships: []
      }
      orders: {
        Row: {
          buyer_document: string
          buyer_email: string
          buyer_is_participant: boolean
          buyer_name: string
          buyer_phone: string | null
          canceled_at: string | null
          created_at: string
          event_id: string
          expires_at: string | null
          id: string
          order_code: string
          order_nsu: string | null
          paid_at: string | null
          participants_count: number
          payment_link: string | null
          payment_provider: string | null
          payment_provider_reference: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          purchase_type: Database["public"]["Enums"]["purchase_type"]
          redirect_status_last_seen: string | null
          total_price_cents: number
          unit_price_cents: number
          updated_at: string
          webhook_status_last_seen: string | null
        }
        Insert: {
          buyer_document: string
          buyer_email: string
          buyer_is_participant?: boolean
          buyer_name: string
          buyer_phone?: string | null
          canceled_at?: string | null
          created_at?: string
          event_id: string
          expires_at?: string | null
          id?: string
          order_code: string
          order_nsu?: string | null
          paid_at?: string | null
          participants_count?: number
          payment_link?: string | null
          payment_provider?: string | null
          payment_provider_reference?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          purchase_type?: Database["public"]["Enums"]["purchase_type"]
          redirect_status_last_seen?: string | null
          total_price_cents: number
          unit_price_cents: number
          updated_at?: string
          webhook_status_last_seen?: string | null
        }
        Update: {
          buyer_document?: string
          buyer_email?: string
          buyer_is_participant?: boolean
          buyer_name?: string
          buyer_phone?: string | null
          canceled_at?: string | null
          created_at?: string
          event_id?: string
          expires_at?: string | null
          id?: string
          order_code?: string
          order_nsu?: string | null
          paid_at?: string | null
          participants_count?: number
          payment_link?: string | null
          payment_provider?: string | null
          payment_provider_reference?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          purchase_type?: Database["public"]["Enums"]["purchase_type"]
          redirect_status_last_seen?: string | null
          total_price_cents?: number
          unit_price_cents?: number
          updated_at?: string
          webhook_status_last_seen?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_events: {
        Row: {
          created_at: string
          event_type: string
          external_event_id: string | null
          id: string
          order_id: string
          processed: boolean
          processed_at: string | null
          provider: string
          raw_payload_json: Json | null
        }
        Insert: {
          created_at?: string
          event_type: string
          external_event_id?: string | null
          id?: string
          order_id: string
          processed?: boolean
          processed_at?: string | null
          provider?: string
          raw_payload_json?: Json | null
        }
        Update: {
          created_at?: string
          event_type?: string
          external_event_id?: string | null
          id?: string
          order_id?: string
          processed?: boolean
          processed_at?: string | null
          provider?: string
          raw_payload_json?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      registrations: {
        Row: {
          area: string | null
          birth_date: string | null
          certificate_issued_at: string | null
          certificate_status: Database["public"]["Enums"]["certificate_status"]
          checkin_at: string | null
          checkin_by_user_id: string | null
          checkin_status: Database["public"]["Enums"]["checkin_status"]
          church_function: string | null
          church_role: string | null
          congregation: string | null
          consent_data_usage: boolean
          consent_terms: boolean
          cpf: string
          created_at: string
          email: string
          event_id: string
          full_name: string
          id: string
          order_id: string
          payment_status: Database["public"]["Enums"]["payment_status"]
          phone: string | null
          qr_generated_at: string | null
          qr_token: string | null
          registration_code: string
          registration_status: Database["public"]["Enums"]["registration_status"]
          registration_type: Database["public"]["Enums"]["purchase_type"]
          updated_at: string
        }
        Insert: {
          area?: string | null
          birth_date?: string | null
          certificate_issued_at?: string | null
          certificate_status?: Database["public"]["Enums"]["certificate_status"]
          checkin_at?: string | null
          checkin_by_user_id?: string | null
          checkin_status?: Database["public"]["Enums"]["checkin_status"]
          church_function?: string | null
          church_role?: string | null
          congregation?: string | null
          consent_data_usage?: boolean
          consent_terms?: boolean
          cpf: string
          created_at?: string
          email: string
          event_id: string
          full_name: string
          id?: string
          order_id: string
          payment_status?: Database["public"]["Enums"]["payment_status"]
          phone?: string | null
          qr_generated_at?: string | null
          qr_token?: string | null
          registration_code: string
          registration_status?: Database["public"]["Enums"]["registration_status"]
          registration_type?: Database["public"]["Enums"]["purchase_type"]
          updated_at?: string
        }
        Update: {
          area?: string | null
          birth_date?: string | null
          certificate_issued_at?: string | null
          certificate_status?: Database["public"]["Enums"]["certificate_status"]
          checkin_at?: string | null
          checkin_by_user_id?: string | null
          checkin_status?: Database["public"]["Enums"]["checkin_status"]
          church_function?: string | null
          church_role?: string | null
          congregation?: string | null
          consent_data_usage?: boolean
          consent_terms?: boolean
          cpf?: string
          created_at?: string
          email?: string
          event_id?: string
          full_name?: string
          id?: string
          order_id?: string
          payment_status?: Database["public"]["Enums"]["payment_status"]
          phone?: string | null
          qr_generated_at?: string | null
          qr_token?: string | null
          registration_code?: string
          registration_status?: Database["public"]["Enums"]["registration_status"]
          registration_type?: Database["public"]["Enums"]["purchase_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "registrations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_checkin_operator: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      admin_role: "superadmin" | "admin" | "checkin_operator"
      certificate_status: "unavailable" | "available" | "issued"
      checkin_action_type: "scan" | "manual"
      checkin_status: "not_checked_in" | "checked_in"
      event_status: "draft" | "published" | "closed" | "canceled" | "concluded"
      payment_status:
        | "pending"
        | "approved"
        | "refused"
        | "canceled"
        | "expired"
        | "refunded"
      purchase_type: "individual" | "batch"
      registration_status:
        | "pending_payment"
        | "confirmed"
        | "canceled"
        | "invalidated"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      admin_role: ["superadmin", "admin", "checkin_operator"],
      certificate_status: ["unavailable", "available", "issued"],
      checkin_action_type: ["scan", "manual"],
      checkin_status: ["not_checked_in", "checked_in"],
      event_status: ["draft", "published", "closed", "canceled", "concluded"],
      payment_status: [
        "pending",
        "approved",
        "refused",
        "canceled",
        "expired",
        "refunded",
      ],
      purchase_type: ["individual", "batch"],
      registration_status: [
        "pending_payment",
        "confirmed",
        "canceled",
        "invalidated",
      ],
    },
  },
} as const
