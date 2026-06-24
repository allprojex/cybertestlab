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
      admin_audit_log: {
        Row: {
          action: string
          admin_email: string | null
          admin_id: string
          applicant_id: string | null
          created_at: string
          id: string
          ip: string | null
          metadata: Json
          user_agent: string | null
        }
        Insert: {
          action: string
          admin_email?: string | null
          admin_id: string
          applicant_id?: string | null
          created_at?: string
          id?: string
          ip?: string | null
          metadata?: Json
          user_agent?: string | null
        }
        Update: {
          action?: string
          admin_email?: string | null
          admin_id?: string
          applicant_id?: string | null
          created_at?: string
          id?: string
          ip?: string | null
          metadata?: Json
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_log_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "applicants"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          brand_logo_url: string | null
          brand_name: string
          cooldown_hours: number
          id: number
          max_attempts: number
          pass_mark: number
          proctoring_enabled: boolean
          updated_at: string
        }
        Insert: {
          brand_logo_url?: string | null
          brand_name?: string
          cooldown_hours?: number
          id?: number
          max_attempts?: number
          pass_mark?: number
          proctoring_enabled?: boolean
          updated_at?: string
        }
        Update: {
          brand_logo_url?: string | null
          brand_name?: string
          cooldown_hours?: number
          id?: number
          max_attempts?: number
          pass_mark?: number
          proctoring_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      applicants: {
        Row: {
          attempts_used: number
          auth_user_id: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          department_id: string | null
          email: string
          full_name: string
          gender: string | null
          id: string
          link_expires_at: string | null
          link_token: string
          notes: string | null
          organization_id: string | null
          phone: string | null
          share_link_id: string | null
          source: string
          status: Database["public"]["Enums"]["applicant_status"]
          updated_at: string
        }
        Insert: {
          attempts_used?: number
          auth_user_id?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          department_id?: string | null
          email: string
          full_name: string
          gender?: string | null
          id?: string
          link_expires_at?: string | null
          link_token?: string
          notes?: string | null
          organization_id?: string | null
          phone?: string | null
          share_link_id?: string | null
          source?: string
          status?: Database["public"]["Enums"]["applicant_status"]
          updated_at?: string
        }
        Update: {
          attempts_used?: number
          auth_user_id?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          department_id?: string | null
          email?: string
          full_name?: string
          gender?: string | null
          id?: string
          link_expires_at?: string | null
          link_token?: string
          notes?: string | null
          organization_id?: string | null
          phone?: string | null
          share_link_id?: string | null
          source?: string
          status?: Database["public"]["Enums"]["applicant_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "applicants_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applicants_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applicants_share_link_id_fkey"
            columns: ["share_link_id"]
            isOneToOne: false
            referencedRelation: "question_set_share_links"
            referencedColumns: ["id"]
          },
        ]
      }
      backup_files: {
        Row: {
          created_at: string
          created_by: string | null
          created_by_email: string | null
          filename: string
          format: string
          id: string
          notes: string | null
          row_count: number
          size_bytes: number
          source: string
          tables: string[]
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          created_by_email?: string | null
          filename: string
          format: string
          id?: string
          notes?: string | null
          row_count?: number
          size_bytes?: number
          source: string
          tables?: string[]
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          created_by_email?: string | null
          filename?: string
          format?: string
          id?: string
          notes?: string | null
          row_count?: number
          size_bytes?: number
          source?: string
          tables?: string[]
          version?: number
        }
        Relationships: []
      }
      departments: {
        Row: {
          code: string | null
          created_at: string
          id: string
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          id?: string
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      login_activity: {
        Row: {
          applicant_id: string | null
          city: string | null
          country: string | null
          created_at: string
          email: string | null
          event: string
          id: string
          ip: string | null
          user_agent: string | null
        }
        Insert: {
          applicant_id?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          event: string
          id?: string
          ip?: string | null
          user_agent?: string | null
        }
        Update: {
          applicant_id?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          event?: string
          id?: string
          ip?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "login_activity_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "applicants"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          active: boolean
          code: string | null
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code?: string | null
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string | null
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      presence_heartbeats: {
        Row: {
          label: string | null
          last_seen: string
          role: string
          session_id: string
        }
        Insert: {
          label?: string | null
          last_seen?: string
          role: string
          session_id: string
        }
        Update: {
          label?: string | null
          last_seen?: string
          role?: string
          session_id?: string
        }
        Relationships: []
      }
      proctoring_snapshots: {
        Row: {
          admin_verdict: Database["public"]["Enums"]["proctor_verdict"]
          applicant_id: string
          attempt_id: string | null
          auto_verdict: string
          created_at: string
          face_match_score: number | null
          id: string
          reviewed_at: string | null
          reviewed_by: string | null
          snapshot_path: string
        }
        Insert: {
          admin_verdict?: Database["public"]["Enums"]["proctor_verdict"]
          applicant_id: string
          attempt_id?: string | null
          auto_verdict?: string
          created_at?: string
          face_match_score?: number | null
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          snapshot_path: string
        }
        Update: {
          admin_verdict?: Database["public"]["Enums"]["proctor_verdict"]
          applicant_id?: string
          attempt_id?: string | null
          auto_verdict?: string
          created_at?: string
          face_match_score?: number | null
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          snapshot_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "proctoring_snapshots_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "applicants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proctoring_snapshots_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "test_attempts"
            referencedColumns: ["id"]
          },
        ]
      }
      question_assignments: {
        Row: {
          applicant_id: string | null
          assigned_by: string | null
          created_at: string
          department_id: string | null
          id: string
          notes: string | null
          organization_id: string | null
          question_id: string
          scope: string
        }
        Insert: {
          applicant_id?: string | null
          assigned_by?: string | null
          created_at?: string
          department_id?: string | null
          id?: string
          notes?: string | null
          organization_id?: string | null
          question_id: string
          scope: string
        }
        Update: {
          applicant_id?: string | null
          assigned_by?: string | null
          created_at?: string
          department_id?: string | null
          id?: string
          notes?: string | null
          organization_id?: string | null
          question_id?: string
          scope?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_assignments_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "applicants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_assignments_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_assignments_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_assignments_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions_public"
            referencedColumns: ["id"]
          },
        ]
      }
      question_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      question_set_assignments: {
        Row: {
          applicant_id: string | null
          assigned_by: string | null
          created_at: string
          department_id: string | null
          id: string
          notes: string | null
          organization_id: string | null
          scope: string
          set_id: string
        }
        Insert: {
          applicant_id?: string | null
          assigned_by?: string | null
          created_at?: string
          department_id?: string | null
          id?: string
          notes?: string | null
          organization_id?: string | null
          scope: string
          set_id: string
        }
        Update: {
          applicant_id?: string | null
          assigned_by?: string | null
          created_at?: string
          department_id?: string | null
          id?: string
          notes?: string | null
          organization_id?: string | null
          scope?: string
          set_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_set_assignments_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "applicants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_set_assignments_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_set_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_set_assignments_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "question_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      question_set_items: {
        Row: {
          created_at: string
          id: string
          question_id: string
          set_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          question_id: string
          set_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          question_id?: string
          set_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "question_set_items_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_set_items_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_set_items_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "question_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      question_set_share_links: {
        Row: {
          created_at: string
          created_by: string | null
          enabled: boolean
          expires_at: string | null
          id: string
          max_uses: number | null
          notes: string | null
          set_id: string
          token: string
          updated_at: string
          uses_count: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          notes?: string | null
          set_id: string
          token?: string
          updated_at?: string
          uses_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          notes?: string | null
          set_id?: string
          token?: string
          updated_at?: string
          uses_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "question_set_share_links_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: true
            referencedRelation: "question_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      question_sets: {
        Row: {
          active: boolean
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      questions: {
        Row: {
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          category_id: string | null
          correct_answer: string | null
          correct_answers: string[] | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          difficulty: string
          id: string
          options: Json | null
          published: boolean
          question_text: string
          question_type: string
          rejection_reason: string | null
          sort_order: number
        }
        Insert: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          category_id?: string | null
          correct_answer?: string | null
          correct_answers?: string[] | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          difficulty?: string
          id?: string
          options?: Json | null
          published?: boolean
          question_text: string
          question_type: string
          rejection_reason?: string | null
          sort_order?: number
        }
        Update: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          category_id?: string | null
          correct_answer?: string | null
          correct_answers?: string[] | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          difficulty?: string
          id?: string
          options?: Json | null
          published?: boolean
          question_text?: string
          question_type?: string
          rejection_reason?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "questions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "question_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      submission_logs: {
        Row: {
          created_at: string
          id: string
          ip_address: string
        }
        Insert: {
          created_at?: string
          id?: string
          ip_address: string
        }
        Update: {
          created_at?: string
          id?: string
          ip_address?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      test_attempts: {
        Row: {
          applicant_id: string
          attempt_number: number
          city: string | null
          country: string | null
          id: string
          ip: string | null
          passed: boolean | null
          percentage: number | null
          question_order: string[] | null
          score: number | null
          started_at: string
          submitted_at: string | null
          total: number | null
        }
        Insert: {
          applicant_id: string
          attempt_number: number
          city?: string | null
          country?: string | null
          id?: string
          ip?: string | null
          passed?: boolean | null
          percentage?: number | null
          question_order?: string[] | null
          score?: number | null
          started_at?: string
          submitted_at?: string | null
          total?: number | null
        }
        Update: {
          applicant_id?: string
          attempt_number?: number
          city?: string | null
          country?: string | null
          id?: string
          ip?: string | null
          passed?: boolean | null
          percentage?: number | null
          question_order?: string[] | null
          score?: number | null
          started_at?: string
          submitted_at?: string | null
          total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "test_attempts_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "applicants"
            referencedColumns: ["id"]
          },
        ]
      }
      test_results: {
        Row: {
          access_token_hash: string | null
          answers: Json
          applicant_email: string | null
          applicant_gender: string | null
          applicant_name: string
          completed_at: string
          id: string
          passed: boolean | null
          percentage: number
          score: number
          total_questions: number
        }
        Insert: {
          access_token_hash?: string | null
          answers: Json
          applicant_email?: string | null
          applicant_gender?: string | null
          applicant_name: string
          completed_at?: string
          id?: string
          passed?: boolean | null
          percentage: number
          score: number
          total_questions: number
        }
        Update: {
          access_token_hash?: string | null
          answers?: Json
          applicant_email?: string | null
          applicant_gender?: string | null
          applicant_name?: string
          completed_at?: string
          id?: string
          passed?: boolean | null
          percentage?: number
          score?: number
          total_questions?: number
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      questions_public: {
        Row: {
          created_at: string | null
          id: string | null
          options: Json | null
          question_text: string | null
          question_type: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          options?: Json | null
          question_text?: string | null
          question_type?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          options?: Json | null
          question_text?: string | null
          question_type?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _recycle_check: { Args: { _table: string }; Returns: undefined }
      admin_user_action:
        | { Args: { _action: string; _applicant: string }; Returns: undefined }
        | {
            Args: {
              _action: string
              _applicant: string
              _ip?: string
              _user_agent?: string
            }
            Returns: Json
          }
      consume_attempt: { Args: { _applicant: string }; Returns: Json }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      log_admin_action: {
        Args: { _action: string; _metadata?: Json }
        Returns: string
      }
      log_login_event: {
        Args: {
          _applicant_id?: string
          _email: string
          _event: string
          _user_agent?: string
        }
        Returns: string
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      notifications_purge: { Args: { _before: string }; Returns: Json }
      preview_resolve_set: {
        Args: { _applicant: string; _dept: string; _org: string }
        Returns: string
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      record_heartbeat: {
        Args: { _label: string; _role: string; _session_id: string }
        Returns: undefined
      }
      recycle_empty: { Args: { _table?: string }; Returns: Json }
      recycle_list: {
        Args: never
        Returns: {
          deleted_at: string
          deleted_by: string
          id: string
          kind: string
          label: string
        }[]
      }
      recycle_purge: { Args: { _id: string; _table: string }; Returns: Json }
      recycle_restore: { Args: { _id: string; _table: string }; Returns: Json }
      recycle_soft_delete: {
        Args: { _id: string; _table: string }
        Returns: Json
      }
      resolve_applicant_set: {
        Args: { _applicant_id: string }
        Returns: string
      }
      share_link_regenerate: { Args: { _link_id: string }; Returns: Json }
      share_link_revoke: { Args: { _link_id: string }; Returns: Json }
    }
    Enums: {
      app_role: "admin" | "user"
      applicant_status: "pending" | "approved" | "rejected" | "suspended"
      proctor_verdict: "unreviewed" | "match" | "no_match"
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
      app_role: ["admin", "user"],
      applicant_status: ["pending", "approved", "rejected", "suspended"],
      proctor_verdict: ["unreviewed", "match", "no_match"],
    },
  },
} as const
