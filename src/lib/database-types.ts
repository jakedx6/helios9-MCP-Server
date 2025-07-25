export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          created_at: string
          updated_at: string
          email: string
          username: string | null
          full_name: string | null
          avatar_url: string | null
        }
        Insert: {
          id: string
          created_at?: string
          updated_at?: string
          email: string
          username?: string | null
          full_name?: string | null
          avatar_url?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string
          email?: string
          username?: string | null
          full_name?: string | null
          avatar_url?: string | null
        }
      }
      api_keys: {
        Row: {
          id: string
          user_id: string
          provider: 'openai' | 'anthropic'
          encrypted_key: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          provider: 'openai' | 'anthropic'
          encrypted_key: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          provider?: 'openai' | 'anthropic'
          encrypted_key?: string
          created_at?: string
          updated_at?: string
        }
      }
      projects: {
        Row: {
          id: string
          user_id: string
          tenant_id: string
          name: string
          description: string | null
          status: 'active' | 'archived' | 'completed'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          tenant_id: string
          name: string
          description?: string | null
          status?: 'active' | 'archived' | 'completed'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          tenant_id?: string
          name?: string
          description?: string | null
          status?: 'active' | 'archived' | 'completed'
          created_at?: string
          updated_at?: string
        }
      }
      tasks: {
        Row: {
          id: string
          project_id: string
          tenant_id: string
          title: string
          description: string | null
          status: 'todo' | 'in_progress' | 'done'
          priority: 'low' | 'medium' | 'high'
          due_date: string | null
          assignee_id: string | null
          initiative_id: string | null
          created_at: string
          updated_at: string
          created_by: string
        }
        Insert: {
          id?: string
          project_id: string
          tenant_id: string
          title: string
          description?: string | null
          status?: 'todo' | 'in_progress' | 'done'
          priority?: 'low' | 'medium' | 'high'
          due_date?: string | null
          assignee_id?: string | null
          initiative_id?: string | null
          created_at?: string
          updated_at?: string
          created_by: string
        }
        Update: {
          id?: string
          project_id?: string
          tenant_id?: string
          title?: string
          description?: string | null
          status?: 'todo' | 'in_progress' | 'done'
          priority?: 'low' | 'medium' | 'high'
          due_date?: string | null
          assignee_id?: string | null
          initiative_id?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string
        }
      }
      documents: {
        Row: {
          id: string
          project_id: string
          tenant_id: string
          title: string
          content: string
          document_type: 'requirement' | 'design' | 'technical' | 'meeting_notes' | 'other'
          created_at: string
          updated_at: string
          created_by: string
        }
        Insert: {
          id?: string
          project_id: string
          tenant_id: string
          title: string
          content: string
          document_type: 'requirement' | 'design' | 'technical' | 'meeting_notes' | 'other'
          created_at?: string
          updated_at?: string
          created_by: string
        }
        Update: {
          id?: string
          project_id?: string
          tenant_id?: string
          title?: string
          content?: string
          document_type?: 'requirement' | 'design' | 'technical' | 'meeting_notes' | 'other'
          created_at?: string
          updated_at?: string
          created_by?: string
        }
      }
      ai_conversations: {
        Row: {
          id: string
          project_id: string
          user_id: string
          tenant_id: string
          messages: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          project_id: string
          user_id: string
          tenant_id: string
          messages: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          user_id?: string
          tenant_id?: string
          messages?: Json
          created_at?: string
          updated_at?: string
        }
      }
      initiatives: {
        Row: {
          id: string
          tenant_id: string
          name: string
          description: string | null
          objective: string
          status: 'planning' | 'active' | 'on_hold' | 'completed' | 'cancelled'
          priority: 'critical' | 'high' | 'medium' | 'low'
          start_date: string | null
          target_date: string | null
          completed_date: string | null
          owner_id: string
          created_by: string
          created_at: string
          updated_at: string
          metadata: Json | null
          tags: string[] | null
          order_index: number
          parent_initiative_id: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          name: string
          description?: string | null
          objective: string
          status?: 'planning' | 'active' | 'on_hold' | 'completed' | 'cancelled'
          priority?: 'critical' | 'high' | 'medium' | 'low'
          start_date?: string | null
          target_date?: string | null
          completed_date?: string | null
          owner_id: string
          created_by: string
          created_at?: string
          updated_at?: string
          metadata?: Json | null
          tags?: string[] | null
          order_index?: number
          parent_initiative_id?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          name?: string
          description?: string | null
          objective?: string
          status?: 'planning' | 'active' | 'on_hold' | 'completed' | 'cancelled'
          priority?: 'critical' | 'high' | 'medium' | 'low'
          start_date?: string | null
          target_date?: string | null
          completed_date?: string | null
          owner_id?: string
          created_by?: string
          created_at?: string
          updated_at?: string
          metadata?: Json | null
          tags?: string[] | null
          order_index?: number
          parent_initiative_id?: string | null
        }
      }
      initiative_milestones: {
        Row: {
          id: string
          initiative_id: string
          name: string
          description: string | null
          target_date: string
          completed_date: string | null
          status: 'pending' | 'in_progress' | 'completed' | 'missed'
          order_index: number
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          initiative_id: string
          name: string
          description?: string | null
          target_date: string
          completed_date?: string | null
          status?: 'pending' | 'in_progress' | 'completed' | 'missed'
          order_index?: number
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          initiative_id?: string
          name?: string
          description?: string | null
          target_date?: string
          completed_date?: string | null
          status?: 'pending' | 'in_progress' | 'completed' | 'missed'
          order_index?: number
          created_by?: string
          created_at?: string
          updated_at?: string
        }
      }
      initiative_documents: {
        Row: {
          id: string
          initiative_id: string
          document_id: string
          added_by: string
          added_at: string
        }
        Insert: {
          id?: string
          initiative_id: string
          document_id: string
          added_by: string
          added_at?: string
        }
        Update: {
          id?: string
          initiative_id?: string
          document_id?: string
          added_by?: string
          added_at?: string
        }
      }
      initiative_projects: {
        Row: {
          id: string
          initiative_id: string
          project_id: string
          added_by: string
          added_at: string
          order_index: number
        }
        Insert: {
          id?: string
          initiative_id: string
          project_id: string
          added_by: string
          added_at?: string
          order_index?: number
        }
        Update: {
          id?: string
          initiative_id?: string
          project_id?: string
          added_by?: string
          added_at?: string
          order_index?: number
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}