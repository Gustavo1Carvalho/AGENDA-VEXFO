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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      cancellations: {
        Row: {
          agent_id: string | null
          cancelled_on: string
          client_id: string
          created_at: string
          created_by: string | null
          current_plan: string | null
          id: string
          notes: string | null
          reason: string
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          cancelled_on?: string
          client_id: string
          created_at?: string
          created_by?: string | null
          current_plan?: string | null
          id?: string
          notes?: string | null
          reason: string
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          cancelled_on?: string
          client_id?: string
          created_at?: string
          created_by?: string | null
          current_plan?: string | null
          id?: string
          notes?: string | null
          reason?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cancellations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          client_code: string | null
          cpf: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          neighborhood: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          client_code?: string | null
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          neighborhood?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          client_code?: string | null
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          neighborhood?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      negotiation_contacts: {
        Row: {
          contact_type: string
          contacted_at: string
          created_at: string
          created_by: string | null
          description: string
          id: string
          negotiation_id: string
        }
        Insert: {
          contact_type?: string
          contacted_at?: string
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          negotiation_id: string
        }
        Update: {
          contact_type?: string
          contacted_at?: string
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          negotiation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "negotiation_contacts_negotiation_id_fkey"
            columns: ["negotiation_id"]
            isOneToOne: false
            referencedRelation: "negotiations"
            referencedColumns: ["id"]
          },
        ]
      }
      negotiations: {
        Row: {
          client_id: string
          converted_at: string | null
          created_at: string
          created_by: string | null
          current_plan: string | null
          id: string
          interested_plan: string | null
          next_contact_on: string | null
          notes: string | null
          reason: string
          registered_on: string
          responsible_id: string | null
          status: Database["public"]["Enums"]["negotiation_status"]
          updated_at: string
        }
        Insert: {
          client_id: string
          converted_at?: string | null
          created_at?: string
          created_by?: string | null
          current_plan?: string | null
          id?: string
          interested_plan?: string | null
          next_contact_on?: string | null
          notes?: string | null
          reason: string
          registered_on?: string
          responsible_id?: string | null
          status?: Database["public"]["Enums"]["negotiation_status"]
          updated_at?: string
        }
        Update: {
          client_id?: string
          converted_at?: string | null
          created_at?: string
          created_by?: string | null
          current_plan?: string | null
          id?: string
          interested_plan?: string | null
          next_contact_on?: string | null
          notes?: string | null
          reason?: string
          registered_on?: string
          responsible_id?: string | null
          status?: Database["public"]["Enums"]["negotiation_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "negotiations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_upgrades: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          id: string
          monthly_difference: number | null
          new_plan: string
          new_value: number
          notes: string | null
          previous_plan: string
          previous_value: number
          responsible_id: string | null
          updated_at: string
          upgrade_date: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          new_plan: string
          new_value: number
          notes?: string | null
          previous_plan: string
          previous_value: number
          responsible_id?: string | null
          updated_at?: string
          upgrade_date?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          new_plan?: string
          new_value?: number
          notes?: string | null
          previous_plan?: string
          previous_value?: number
          responsible_id?: string | null
          updated_at?: string
          upgrade_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_upgrades_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      referrals: {
        Row: {
          agent_id: string | null
          contracted_on: string | null
          contracted_plan: string | null
          created_at: string
          created_by: string | null
          id: string
          new_contract_number: string | null
          referred_name: string
          referred_on: string
          referred_phone: string
          referrer_client_id: string
          status: Database["public"]["Enums"]["referral_status"]
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          contracted_on?: string | null
          contracted_plan?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          new_contract_number?: string | null
          referred_name: string
          referred_on?: string
          referred_phone: string
          referrer_client_id: string
          status?: Database["public"]["Enums"]["referral_status"]
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          contracted_on?: string | null
          contracted_plan?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          new_contract_number?: string | null
          referred_name?: string
          referred_on?: string
          referred_phone?: string
          referrer_client_id?: string
          status?: Database["public"]["Enums"]["referral_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrals_referrer_client_id_fkey"
            columns: ["referrer_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      router_swaps: {
        Row: {
          contract_number: string | null
          created_at: string
          id: string
          notes: string | null
          reason: string
          reason_other: string | null
          service_order_id: string
          technician_id: string | null
          updated_at: string
        }
        Insert: {
          contract_number?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          reason: string
          reason_other?: string | null
          service_order_id: string
          technician_id?: string | null
          updated_at?: string
        }
        Update: {
          contract_number?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          reason?: string
          reason_other?: string | null
          service_order_id?: string
          technician_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "router_swaps_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      service_orders: {
        Row: {
          address: string
          city: string | null
          client_name: string
          client_phone: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          neighborhood: string
          notes: string | null
          reference: string | null
          scheduled_date: string
          scheduled_time: string
          service_type: Database["public"]["Enums"]["service_type"]
          started_at: string | null
          state: string | null
          status: Database["public"]["Enums"]["service_status"]
          technician_id: string | null
          updated_at: string
        }
        Insert: {
          address: string
          city?: string | null
          client_name: string
          client_phone: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          neighborhood: string
          notes?: string | null
          reference?: string | null
          scheduled_date: string
          scheduled_time: string
          service_type: Database["public"]["Enums"]["service_type"]
          started_at?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["service_status"]
          technician_id?: string | null
          updated_at?: string
        }
        Update: {
          address?: string
          city?: string | null
          client_name?: string
          client_phone?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          neighborhood?: string
          notes?: string | null
          reference?: string | null
          scheduled_date?: string
          scheduled_time?: string
          service_type?: Database["public"]["Enums"]["service_type"]
          started_at?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["service_status"]
          technician_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "tecnico"
      negotiation_status: "em_negociacao" | "bloqueado" | "convertido"
      referral_status: "contratou" | "nao_contratou"
      service_status:
        | "pendente"
        | "aceito"
        | "em_deslocamento"
        | "em_atendimento"
        | "finalizado"
        | "cancelado"
      service_type:
        | "instalacao"
        | "visita_tecnica"
        | "manutencao"
        | "retirada_equipamento"
        | "troca_roteador"
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
      app_role: ["admin", "tecnico"],
      negotiation_status: ["em_negociacao", "bloqueado", "convertido"],
      referral_status: ["contratou", "nao_contratou"],
      service_status: [
        "pendente",
        "aceito",
        "em_deslocamento",
        "em_atendimento",
        "finalizado",
        "cancelado",
      ],
      service_type: [
        "instalacao",
        "visita_tecnica",
        "manutencao",
        "retirada_equipamento",
        "troca_roteador",
      ],
    },
  },
} as const
