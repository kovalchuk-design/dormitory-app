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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      academic_years: {
        Row: {
          created_at: string
          end_date: string
          id: string
          is_current: boolean
          name: string
          start_date: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          is_current?: boolean
          name: string
          start_date: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          is_current?: boolean
          name?: string
          start_date?: string
          updated_at?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json
          id: number
          record_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: never
          record_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: never
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      document_templates: {
        Row: {
          created_at: string
          id: string
          placeholders: Json
          storage_path: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          placeholders?: Json
          storage_path: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          placeholders?: Json
          storage_path?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          academic_year_id: string | null
          author_id: string | null
          based_on_document_id: string | null
          category: string | null
          created_at: string
          id: string
          mime_type: string | null
          storage_path: string
          tags: string[]
          title: string
          topic: string | null
          updated_at: string
        }
        Insert: {
          academic_year_id?: string | null
          author_id?: string | null
          based_on_document_id?: string | null
          category?: string | null
          created_at?: string
          id?: string
          mime_type?: string | null
          storage_path: string
          tags?: string[]
          title: string
          topic?: string | null
          updated_at?: string
        }
        Update: {
          academic_year_id?: string | null
          author_id?: string | null
          based_on_document_id?: string | null
          category?: string | null
          created_at?: string
          id?: string
          mime_type?: string | null
          storage_path?: string
          tags?: string[]
          title?: string
          topic?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_based_on_document_id_fkey"
            columns: ["based_on_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      event_attendance: {
        Row: {
          absence_reason: string | null
          created_at: string
          id: string
          present: boolean
          session_id: string
          student_id: string
          updated_at: string
        }
        Insert: {
          absence_reason?: string | null
          created_at?: string
          id?: string
          present?: boolean
          session_id: string
          student_id: string
          updated_at?: string
        }
        Update: {
          absence_reason?: string | null
          created_at?: string
          id?: string
          present?: boolean
          session_id?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_attendance_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "event_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "v_unplaced_students"
            referencedColumns: ["id"]
          },
        ]
      }
      event_plan: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          planned_date: string
          required_documents: string | null
          responsible_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          planned_date: string
          required_documents?: string | null
          responsible_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          planned_date?: string
          required_documents?: string | null
          responsible_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_plan_responsible_id_fkey"
            columns: ["responsible_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_quotas: {
        Row: {
          academic_year_id: string
          created_at: string
          educator_id: string
          id: string
          required_count: number
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          created_at?: string
          educator_id: string
          id?: string
          required_count: number
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          created_at?: string
          educator_id?: string
          id?: string
          required_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_quotas_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_quotas_educator_id_fkey"
            columns: ["educator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_sessions: {
        Row: {
          academic_year_id: string
          created_at: string
          description: Json
          educator_id: string
          format: string | null
          held_on: string | null
          id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          created_at?: string
          description?: Json
          educator_id: string
          format?: string | null
          held_on?: string | null
          id?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          created_at?: string
          description?: Json
          educator_id?: string
          format?: string | null
          held_on?: string | null
          id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_sessions_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_sessions_educator_id_fkey"
            columns: ["educator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      intake_links: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string
          floor: number | null
          id: string
          max_submissions: number
          revoked_at: string | null
          token_hash: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at: string
          floor?: number | null
          id?: string
          max_submissions?: number
          revoked_at?: string | null
          token_hash: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string
          floor?: number | null
          id?: string
          max_submissions?: number
          revoked_at?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "intake_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      intake_submissions: {
        Row: {
          id: string
          link_id: string
          match_method: string | null
          payload: Json | null
          profile_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          student_id: string | null
          submitted_at: string
          submitted_birth_date: string
          submitted_full_name: string
        }
        Insert: {
          id?: string
          link_id: string
          match_method?: string | null
          payload?: Json | null
          profile_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          student_id?: string | null
          submitted_at?: string
          submitted_birth_date: string
          submitted_full_name: string
        }
        Update: {
          id?: string
          link_id?: string
          match_method?: string | null
          payload?: Json | null
          profile_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          student_id?: string | null
          submitted_at?: string
          submitted_birth_date?: string
          submitted_full_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "intake_submissions_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "intake_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_submissions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "student_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_submissions_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_submissions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      professions: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          floor: number | null
          full_name: string
          id: string
          is_active: boolean
          must_change_password: boolean
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          floor?: number | null
          full_name?: string
          id: string
          is_active?: boolean
          must_change_password?: boolean
          role?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          floor?: number | null
          full_name?: string
          id?: string
          is_active?: boolean
          must_change_password?: boolean
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      questionnaire_rate_limits: {
        Row: {
          hits: number
          key: string
          window_start: string
        }
        Insert: {
          hits?: number
          key: string
          window_start?: string
        }
        Update: {
          hits?: number
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      room_assignments: {
        Row: {
          created_at: string
          end_reason: string | null
          ended_by: string | null
          from_date: string
          id: string
          moved_by: string | null
          reason: string | null
          room_id: string
          student_id: string
          to_date: string | null
        }
        Insert: {
          created_at?: string
          end_reason?: string | null
          ended_by?: string | null
          from_date?: string
          id?: string
          moved_by?: string | null
          reason?: string | null
          room_id: string
          student_id: string
          to_date?: string | null
        }
        Update: {
          created_at?: string
          end_reason?: string | null
          ended_by?: string | null
          from_date?: string
          id?: string
          moved_by?: string | null
          reason?: string | null
          room_id?: string
          student_id?: string
          to_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "room_assignments_ended_by_fkey"
            columns: ["ended_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_assignments_moved_by_fkey"
            columns: ["moved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_assignments_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_assignments_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "v_room_occupancy"
            referencedColumns: ["room_id"]
          },
          {
            foreignKeyName: "room_assignments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_assignments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "v_unplaced_students"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          capacity: number
          created_at: string
          floor: number
          id: string
          is_active: boolean
          number: string
          updated_at: string
        }
        Insert: {
          capacity?: number
          created_at?: string
          floor: number
          id?: string
          is_active?: boolean
          number: string
          updated_at?: string
        }
        Update: {
          capacity?: number
          created_at?: string
          floor?: number
          id?: string
          is_active?: boolean
          number?: string
          updated_at?: string
        }
        Relationships: []
      }
      student_medical: {
        Row: {
          allergies: string | null
          chronic_conditions: string | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          student_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          allergies?: string | null
          chronic_conditions?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          student_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          allergies?: string | null
          chronic_conditions?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          student_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_medical_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_medical_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_medical_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "v_unplaced_students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_medical_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      student_medical_submissions: {
        Row: {
          allergies: string | null
          chronic_conditions: string | null
          created_at: string
          profile_id: string
        }
        Insert: {
          allergies?: string | null
          chronic_conditions?: string | null
          created_at?: string
          profile_id: string
        }
        Update: {
          allergies?: string | null
          chronic_conditions?: string | null
          created_at?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_medical_submissions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "student_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      student_profiles: {
        Row: {
          address: string | null
          approved_at: string | null
          approved_by: string | null
          class_teacher: string | null
          college_plans: string | null
          consent_at: string | null
          created_at: string
          father_name: string | null
          father_phone: string | null
          group_number: string | null
          guardian_name: string | null
          guardian_phone: string | null
          guardian_relation: string | null
          id: string
          master: string | null
          mother_name: string | null
          mother_phone: string | null
          profession: string | null
          rejected_at: string | null
          rejected_by: string | null
          school_activities: string | null
          social_status: string | null
          social_status_data: Json | null
          status: string
          student_id: string
          student_phone: string | null
          submitted_at: string
          submitted_birth_date: string | null
          submitted_full_name: string | null
          submitted_room: string | null
          updated_at: string
          version_no: number
        }
        Insert: {
          address?: string | null
          approved_at?: string | null
          approved_by?: string | null
          class_teacher?: string | null
          college_plans?: string | null
          consent_at?: string | null
          created_at?: string
          father_name?: string | null
          father_phone?: string | null
          group_number?: string | null
          guardian_name?: string | null
          guardian_phone?: string | null
          guardian_relation?: string | null
          id?: string
          master?: string | null
          mother_name?: string | null
          mother_phone?: string | null
          profession?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          school_activities?: string | null
          social_status?: string | null
          social_status_data?: Json | null
          status?: string
          student_id: string
          student_phone?: string | null
          submitted_at?: string
          submitted_birth_date?: string | null
          submitted_full_name?: string | null
          submitted_room?: string | null
          updated_at?: string
          version_no: number
        }
        Update: {
          address?: string | null
          approved_at?: string | null
          approved_by?: string | null
          class_teacher?: string | null
          college_plans?: string | null
          consent_at?: string | null
          created_at?: string
          father_name?: string | null
          father_phone?: string | null
          group_number?: string | null
          guardian_name?: string | null
          guardian_phone?: string | null
          guardian_relation?: string | null
          id?: string
          master?: string | null
          mother_name?: string | null
          mother_phone?: string | null
          profession?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          school_activities?: string | null
          social_status?: string | null
          social_status_data?: Json | null
          status?: string
          student_id?: string
          student_phone?: string | null
          submitted_at?: string
          submitted_birth_date?: string | null
          submitted_full_name?: string | null
          submitted_room?: string | null
          updated_at?: string
          version_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "student_profiles_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_profiles_rejected_by_fkey"
            columns: ["rejected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_profiles_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_profiles_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "v_unplaced_students"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          academic_year_id: string | null
          birth_date: string | null
          created_at: string
          first_name: string
          grade: number
          id: string
          last_name: string
          notes: string | null
          patronymic: string | null
          status: string
          updated_at: string
        }
        Insert: {
          academic_year_id?: string | null
          birth_date?: string | null
          created_at?: string
          first_name: string
          grade: number
          id?: string
          last_name: string
          notes?: string | null
          patronymic?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string | null
          birth_date?: string | null
          created_at?: string
          first_name?: string
          grade?: number
          id?: string
          last_name?: string
          notes?: string | null
          patronymic?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
        ]
      }
      update_requests: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          kind: string
          resulting_profile_id: string | null
          student_id: string
          token_hash: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          kind: string
          resulting_profile_id?: string | null
          student_id: string
          token_hash: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          kind?: string
          resulting_profile_id?: string | null
          student_id?: string
          token_hash?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "update_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "update_requests_resulting_profile_id_fkey"
            columns: ["resulting_profile_id"]
            isOneToOne: false
            referencedRelation: "student_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "update_requests_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "update_requests_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "v_unplaced_students"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_room_occupancy: {
        Row: {
          capacity: number | null
          floor: number | null
          free: number | null
          is_active: boolean | null
          occupied: number | null
          room: string | null
          room_id: string | null
        }
        Relationships: []
      }
      v_unplaced_students: {
        Row: {
          academic_year_id: string | null
          created_at: string | null
          first_name: string | null
          grade: number | null
          id: string | null
          last_name: string | null
          patronymic: string | null
        }
        Insert: {
          academic_year_id?: string | null
          created_at?: string | null
          first_name?: string | null
          grade?: number | null
          id?: string | null
          last_name?: string | null
          patronymic?: string | null
        }
        Update: {
          academic_year_id?: string | null
          created_at?: string | null
          first_name?: string | null
          grade?: number | null
          id?: string | null
          last_name?: string | null
          patronymic?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "students_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_set_profile: {
        Args: {
          p_floor: number
          p_is_active: boolean
          p_role: string
          p_user_id: string
        }
        Returns: undefined
      }
      approve_student_profile: {
        Args: { p_profile_id: string }
        Returns: undefined
      }
      assign_student: {
        Args: { p_reason?: string; p_room_id: string; p_student_id: string }
        Returns: string
      }
      complete_password_change: { Args: never; Returns: undefined }
      create_intake_link: {
        Args: { p_floor: number; p_ttl_days?: number }
        Returns: string
      }
      create_student_from_intake: {
        Args: { p_grade: number; p_submission_id: string }
        Returns: string
      }
      dismiss_intake_submission: {
        Args: { p_submission_id: string }
        Returns: undefined
      }
      get_intake_link_state: { Args: { p_token_hash: string }; Returns: boolean }
      resolve_intake_submission: {
        Args: { p_student_id: string; p_submission_id: string }
        Returns: string
      }
      revoke_intake_link: { Args: { p_link_id: string }; Returns: undefined }
      submit_intake: {
        Args: { p_payload: Json; p_token_hash: string }
        Returns: boolean
      }
      create_update_request: {
        Args: { p_kind: string; p_student_id: string; p_ttl_days?: number }
        Returns: string
      }
      get_questionnaire_data: { Args: { p_token_hash: string }; Returns: Json }
      move_student: {
        Args: { p_reason?: string; p_room_id: string; p_student_id: string }
        Returns: string
      }
      my_session_is_pin: { Args: never; Returns: boolean }
      questionnaire_rate_hit: {
        Args: { p_key: string; p_limit: number; p_window_seconds: number }
        Returns: boolean
      }
      reject_student_profile: {
        Args: { p_profile_id: string }
        Returns: undefined
      }
      revoke_update_request: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      set_current_academic_year: {
        Args: { p_year_id: string }
        Returns: undefined
      }
      submit_questionnaire: {
        Args: { p_payload: Json; p_token_hash: string }
        Returns: boolean
      }
      svc_pin_begin_attempt: { Args: { p_user: string }; Returns: number }
      svc_pin_fail: { Args: { p_user: string }; Returns: boolean }
      svc_pin_success: { Args: { p_user: string }; Returns: undefined }
      svc_admin_audit: {
        Args: { p_actor: string; p_details?: Json; p_event: string; p_target: string }
        Returns: undefined
      }
      svc_admin_revoke_sessions: { Args: { p_user: string }; Returns: number }
      svc_admin_update_profile: {
        Args: {
          p_actor: string
          p_floor?: number
          p_full_name?: string
          p_is_active?: boolean
          p_must_change_password?: boolean
          p_role?: string
          p_set_floor?: boolean
          p_target: string
        }
        Returns: {
          created_at: string
          floor: number | null
          full_name: string
          id: string
          is_active: boolean
          must_change_password: boolean
          role: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      unassign_student: {
        Args: { p_reason?: string; p_student_id: string }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
