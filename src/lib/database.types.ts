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
      categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          name_en: string | null
          project_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          name_en?: string | null
          project_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          name_en?: string | null
          project_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "categories_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_order_counters: {
        Row: {
          counter: number
          date: string
          project_id: string
        }
        Insert: {
          counter?: number
          date?: string
          project_id: string
        }
        Update: {
          counter?: number
          date?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_order_counters_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      impersonation_sessions: {
        Row: {
          created_at: string
          ended_at: string | null
          expires_at: string
          id: string
          super_admin_session: Json
          super_admin_user_id: string
          target_project_id: string | null
          target_session: Json
          target_user_id: string
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          expires_at: string
          id?: string
          super_admin_session: Json
          super_admin_user_id: string
          target_project_id?: string | null
          target_session: Json
          target_user_id: string
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          expires_at?: string
          id?: string
          super_admin_session?: Json
          super_admin_user_id?: string
          target_project_id?: string | null
          target_session?: Json
          target_user_id?: string
        }
        Relationships: []
      }
      order_audit_logs: {
        Row: {
          actor_user_id: string | null
          created_at: string
          event: string
          id: string
          metadata: Json | null
          new_status: string | null
          old_status: string | null
          order_id: string
          project_id: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          event: string
          id?: string
          metadata?: Json | null
          new_status?: string | null
          old_status?: string | null
          order_id: string
          project_id: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          event?: string
          id?: string
          metadata?: Json | null
          new_status?: string | null
          old_status?: string | null
          order_id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_audit_logs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_audit_logs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          addons: Json
          id: string
          notes: string | null
          order_id: string
          product_id: string | null
          product_name: string
          quantity: number
          status: string
          unit_price: number
        }
        Insert: {
          addons?: Json
          id?: string
          notes?: string | null
          order_id: string
          product_id?: string | null
          product_name: string
          quantity?: number
          status?: string
          unit_price: number
        }
        Update: {
          addons?: Json
          id?: string
          notes?: string | null
          order_id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          status?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey1"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey1"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          customer_id: string | null
          id: string
          idempotency_key: string | null
          notes: string | null
          order_number: number
          project_id: string
          service_type: string | null
          status: Database["public"]["Enums"]["order_status"]
          table_id: string | null
          total_amount: number
          type: Database["public"]["Enums"]["order_type"]
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          id?: string
          idempotency_key?: string | null
          notes?: string | null
          order_number?: number
          project_id: string
          service_type?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          table_id?: string | null
          total_amount?: number
          type?: Database["public"]["Enums"]["order_type"]
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          id?: string
          idempotency_key?: string | null
          notes?: string | null
          order_number?: number
          project_id?: string
          service_type?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          table_id?: string | null
          total_amount?: number
          type?: Database["public"]["Enums"]["order_type"]
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["id"]
          },
        ]
      }
      product_addons: {
        Row: {
          id: string
          is_available: boolean
          name: string
          price: number
          product_id: string
        }
        Insert: {
          id?: string
          is_available?: boolean
          name: string
          price?: number
          product_id: string
        }
        Update: {
          id?: string
          is_available?: boolean
          name?: string
          price?: number
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_addons_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category_id: string | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_available: boolean
          name: string
          name_en: string | null
          price: number
          project_id: string
          sort_order: number
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_available?: boolean
          name: string
          name_en?: string | null
          price: number
          project_id: string
          sort_order?: number
        }
        Update: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_available?: boolean
          name?: string
          name_en?: string | null
          price?: number
          project_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey1"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          deleted_at: string | null
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          plan_code: string
          primary_color: string
          slug: string
          subscription_expires_at: string
          vat_rate: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          plan_code?: string
          primary_color?: string
          slug: string
          subscription_expires_at?: string
          vat_rate?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          plan_code?: string
          primary_color?: string
          slug?: string
          subscription_expires_at?: string
          vat_rate?: number
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          project_id: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          project_id: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          project_id?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          count: number
          key: string
          reset_at: string
        }
        Insert: {
          count?: number
          key: string
          reset_at: string
        }
        Update: {
          count?: number
          key?: string
          reset_at?: string
        }
        Relationships: []
      }
      service_requests: {
        Row: {
          created_at: string
          id: string
          is_resolved: boolean
          project_id: string
          table_id: string
          type: Database["public"]["Enums"]["service_request_type"]
        }
        Insert: {
          created_at?: string
          id?: string
          is_resolved?: boolean
          project_id: string
          table_id: string
          type: Database["public"]["Enums"]["service_request_type"]
        }
        Update: {
          created_at?: string
          id?: string
          is_resolved?: boolean
          project_id?: string
          table_id?: string
          type?: Database["public"]["Enums"]["service_request_type"]
        }
        Relationships: [
          {
            foreignKeyName: "service_requests_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_members: {
        Row: {
          created_at: string
          id: string
          notify_push: boolean
          notify_telegram: boolean
          project_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notify_push?: boolean
          notify_telegram?: boolean
          project_id: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notify_push?: boolean
          notify_telegram?: boolean
          project_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      super_admin_audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          id: string
          metadata: Json
          target_project_id: string | null
          target_user_id: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          target_project_id?: string | null
          target_user_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          target_project_id?: string | null
          target_user_id?: string | null
        }
        Relationships: []
      }
      super_admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tables: {
        Row: {
          branch_id: string | null
          created_at: string
          id: string
          is_active: boolean
          number: number
          project_id: string
          qrcode: string
          slug: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          number: number
          project_id: string
          qrcode?: string
          slug: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          number?: number
          project_id?: string
          qrcode?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "tables_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_link_codes: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          project_id: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          project_id: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_link_codes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_links: {
        Row: {
          chat_id: string
          created_at: string
          id: string
          kind: string
          label: string | null
          project_id: string
          user_id: string | null
        }
        Insert: {
          chat_id: string
          created_at?: string
          id?: string
          kind?: string
          label?: string | null
          project_id: string
          user_id?: string | null
        }
        Update: {
          chat_id?: string
          created_at?: string
          id?: string
          kind?: string
          label?: string | null
          project_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "telegram_links_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          audience_filter: Json
          channel: string
          created_at: string
          created_by: string | null
          id: string
          message_ar: string
          message_en: string | null
          name: string
          project_id: string
          scheduled_at: string | null
          sent_count: number
          status: string
        }
        Insert: {
          audience_filter?: Json
          channel: string
          created_at?: string
          created_by?: string | null
          id?: string
          message_ar: string
          message_en?: string | null
          name: string
          project_id: string
          scheduled_at?: string | null
          sent_count?: number
          status?: string
        }
        Update: {
          audience_filter?: Json
          channel?: string
          created_at?: string
          created_by?: string | null
          id?: string
          message_ar?: string
          message_en?: string | null
          name?: string
          project_id?: string
          scheduled_at?: string | null
          sent_count?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          created_at: string
          email: string | null
          id: string
          is_opted_in: boolean
          last_visit_at: string | null
          loyalty_points: number
          name: string | null
          name_en: string | null
          notes: string | null
          phone: string
          project_id: string
          total_spent: number
          visit_count: number
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          is_opted_in?: boolean
          last_visit_at?: string | null
          loyalty_points?: number
          name?: string | null
          name_en?: string | null
          notes?: string | null
          phone: string
          project_id: string
          total_spent?: number
          visit_count?: number
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          is_opted_in?: boolean
          last_visit_at?: string | null
          loyalty_points?: number
          name?: string | null
          name_en?: string | null
          notes?: string | null
          phone?: string
          project_id?: string
          total_spent?: number
          visit_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "customers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          occurred_on: string
          project_id: string
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          occurred_on?: string
          project_id: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          occurred_on?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback: {
        Row: {
          comment: string | null
          created_at: string
          customer_id: string | null
          id: string
          order_id: string | null
          project_id: string
          rating: number
        }
        Insert: {
          comment?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          order_id?: string | null
          project_id: string
          rating: number
        }
        Update: {
          comment?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          order_id?: string | null
          project_id?: string
          rating?: number
        }
        Relationships: [
          {
            foreignKeyName: "feedback_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      ingredients: {
        Row: {
          id: string
          inventory_item_id: string
          product_id: string
          project_id: string
          quantity: number
        }
        Insert: {
          id?: string
          inventory_item_id: string
          product_id: string
          project_id: string
          quantity?: number
        }
        Update: {
          id?: string
          inventory_item_id?: string
          product_id?: string
          project_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "ingredients_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredients_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredients_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          cost: number
          created_at: string
          id: string
          is_active: boolean
          name: string
          project_id: string
          qty_on_hand: number
          reorder_level: number
          sku: string | null
          supplier_id: string | null
          unit: string
        }
        Insert: {
          cost?: number
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          project_id: string
          qty_on_hand?: number
          reorder_level?: number
          sku?: string | null
          supplier_id?: string | null
          unit?: string
        }
        Update: {
          cost?: number
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          project_id?: string
          qty_on_hand?: number
          reorder_level?: number
          sku?: string | null
          supplier_id?: string | null
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_events: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string
          id: string
          kind: string
          points: number
          project_id: string
          reason: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id: string
          id?: string
          kind: string
          points: number
          project_id: string
          reason?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string
          id?: string
          kind?: string
          points?: number
          project_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_events_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          id: string
          inventory_item_id: string
          purchase_order_id: string
          quantity: number
          unit_cost: number
        }
        Insert: {
          id?: string
          inventory_item_id: string
          purchase_order_id: string
          quantity: number
          unit_cost?: number
        }
        Update: {
          id?: string
          inventory_item_id?: string
          purchase_order_id?: string
          quantity?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          created_at: string
          created_by: string | null
          expected_at: string | null
          id: string
          notes: string | null
          project_id: string
          received_at: string | null
          status: string
          supplier_id: string
          total: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expected_at?: string | null
          id?: string
          notes?: string | null
          project_id: string
          received_at?: string | null
          status?: string
          supplier_id: string
          total?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expected_at?: string | null
          id?: string
          notes?: string | null
          project_id?: string
          received_at?: string | null
          status?: string
          supplier_id?: string
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_shifts: {
        Row: {
          created_at: string
          created_by: string | null
          end_at: string | null
          id: string
          notes: string | null
          project_id: string
          staff_member_id: string
          start_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          end_at?: string | null
          id?: string
          notes?: string | null
          project_id: string
          staff_member_id: string
          start_at: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          end_at?: string | null
          id?: string
          notes?: string | null
          project_id?: string
          staff_member_id?: string
          start_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_shifts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_shifts_staff_member_id_fkey"
            columns: ["staff_member_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          billing_interval: string
          code: string
          created_at: string
          features: Json
          id: string
          is_active: boolean
          max_branches: number | null
          max_products: number | null
          max_staff: number | null
          max_tables: number | null
          name: string
          name_en: string | null
          price: number
        }
        Insert: {
          billing_interval?: string
          code: string
          created_at?: string
          features?: Json
          id?: string
          is_active?: boolean
          max_branches?: number | null
          max_products?: number | null
          max_staff?: number | null
          max_tables?: number | null
          name: string
          name_en?: string | null
          price?: number
        }
        Update: {
          billing_interval?: string
          code?: string
          created_at?: string
          features?: Json
          id?: string
          is_active?: boolean
          max_branches?: number | null
          max_products?: number | null
          max_staff?: number | null
          max_tables?: number | null
          name?: string
          name_en?: string | null
          price?: number
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
          project_id: string
        }
        Insert: {
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          project_id: string
        }
        Update: {
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      advance_order_status: {
        Args: {
          p_caller_user_id?: string
          p_expected_status: string
          p_new_status: string
          p_order_id: string
        }
        Returns: Json
      }
      create_order_transactional: {
        Args: {
          p_caller_user_id?: string
          p_idempotency_key?: string
          p_items: Json
          p_notes?: string
          p_order_number: number
          p_project_id: string
          p_status: string
          p_table_id?: string
          p_total_amount: number
          p_type: string
        }
        Returns: Json
      }
      expire_subscriptions: { Args: never; Returns: number }
      generate_basic_slug: { Args: { input: string }; Returns: string }
      is_project_member: { Args: { p_project_id: string }; Returns: boolean }
      is_project_member_for: {
        Args: { p_project_id: string; p_user_id: string }
        Returns: boolean
      }
      is_project_owner: { Args: { p_project_id: string }; Returns: boolean }
      is_project_owner_or_manager: {
        Args: { p_project: string }
        Returns: boolean
      }
      is_project_publicly_available: {
        Args: { p_slug: string }
        Returns: boolean
      }
      is_super_admin: { Args: never; Returns: boolean }
      next_order_number: {
        Args: { p_caller_user_id?: string; p_project_id: string }
        Returns: number
      }
      project_has_no_members: {
        Args: { p_project_id: string }
        Returns: boolean
      }
      rate_limit_check: {
        Args: {
          p_caller_user_id?: string
          p_key: string
          p_limit: number
          p_project_id?: string
          p_window_ms: number
        }
        Returns: Json
      }
      renew_subscription: {
        Args: {
          p_caller_user_id?: string
          p_days?: number
          p_project_id: string
        }
        Returns: string
      }
      sum_order_totals: {
        Args: { p_end: string; p_project: string; p_start: string }
        Returns: number
      }
      super_admin_archive_project: {
        Args: { p_caller_user_id?: string; p_project_id: string }
        Returns: boolean
      }
      super_admin_deactivate_project: {
        Args: { p_caller_user_id?: string; p_project_id: string }
        Returns: boolean
      }
      super_admin_hard_delete_project: {
        Args: { p_caller_user_id?: string; p_project_id: string }
        Returns: boolean
      }
      unaccent: { Args: { "": string }; Returns: string }
    }
    Enums: {
      app_role: "super_admin" | "owner" | "manager" | "staff"
      order_status:
        | "pending"
        | "preparing"
        | "ready"
        | "delivered"
        | "cancelled"
      order_type: "dinein" | "walkin" | "drivethru"
      service_request_type: "waiter" | "bill"
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
      app_role: ["super_admin", "owner", "manager", "staff"],
      order_status: ["pending", "preparing", "ready", "delivered", "cancelled"],
      order_type: ["dinein", "walkin", "drivethru"],
      service_request_type: ["waiter", "bill"],
    },
  },
} as const
