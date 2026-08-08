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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      ai_conversations: {
        Row: {
          created_at: string
          id: string
          project_id: string
          source_scope: Json
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          source_scope?: Json
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          source_scope?: Json
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_messages: {
        Row: {
          citations: Json
          content: string
          conversation_id: string
          created_at: string
          id: string
          model: string | null
          role: string
          structured_claims: Json
        }
        Insert: {
          citations?: Json
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          model?: string | null
          role: string
          structured_claims?: Json
        }
        Update: {
          citations?: Json
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          model?: string | null
          role?: string
          structured_claims?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          campaign_information: string | null
          created_at: string
          description: string | null
          id: string
          market: string | null
          metadata: Json
          name: string
          objectives: string | null
          positioning: string | null
          project_id: string
          target_audience: string | null
          tone: string | null
          updated_at: string
        }
        Insert: {
          campaign_information?: string | null
          created_at?: string
          description?: string | null
          id?: string
          market?: string | null
          metadata?: Json
          name: string
          objectives?: string | null
          positioning?: string | null
          project_id: string
          target_audience?: string | null
          tone?: string | null
          updated_at?: string
        }
        Update: {
          campaign_information?: string | null
          created_at?: string
          description?: string | null
          id?: string
          market?: string | null
          metadata?: Json
          name?: string
          objectives?: string | null
          positioning?: string | null
          project_id?: string
          target_audience?: string | null
          tone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brands_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      brief_sources: {
        Row: {
          brief_id: string
          created_at: string
          excerpt: string | null
          id: string
          source_id: string
          source_type: Database["public"]["Enums"]["item_kind"]
        }
        Insert: {
          brief_id: string
          created_at?: string
          excerpt?: string | null
          id?: string
          source_id: string
          source_type: Database["public"]["Enums"]["item_kind"]
        }
        Update: {
          brief_id?: string
          created_at?: string
          excerpt?: string | null
          id?: string
          source_id?: string
          source_type?: Database["public"]["Enums"]["item_kind"]
        }
        Relationships: [
          {
            foreignKeyName: "brief_sources_brief_id_fkey"
            columns: ["brief_id"]
            isOneToOne: false
            referencedRelation: "briefs"
            referencedColumns: ["id"]
          },
        ]
      }
      briefs: {
        Row: {
          audience_observation: string | null
          brand: string | null
          business_problem: string | null
          client: string | null
          communication_problem: string | null
          consumer_tension: string | null
          created_at: string
          created_by: string
          cultural_context: string | null
          id: string
          insight: string | null
          mandatories: string | null
          market: string | null
          project_id: string
          proposition: string | null
          reasons_to_believe: string | null
          status: string
          strategic_opportunity: string | null
          target_audience: string | null
          title: string
          tone: string | null
          updated_at: string
        }
        Insert: {
          audience_observation?: string | null
          brand?: string | null
          business_problem?: string | null
          client?: string | null
          communication_problem?: string | null
          consumer_tension?: string | null
          created_at?: string
          created_by: string
          cultural_context?: string | null
          id?: string
          insight?: string | null
          mandatories?: string | null
          market?: string | null
          project_id: string
          proposition?: string | null
          reasons_to_believe?: string | null
          status?: string
          strategic_opportunity?: string | null
          target_audience?: string | null
          title: string
          tone?: string | null
          updated_at?: string
        }
        Update: {
          audience_observation?: string | null
          brand?: string | null
          business_problem?: string | null
          client?: string | null
          communication_problem?: string | null
          consumer_tension?: string | null
          created_at?: string
          created_by?: string
          cultural_context?: string | null
          id?: string
          insight?: string | null
          mandatories?: string | null
          market?: string | null
          project_id?: string
          proposition?: string | null
          reasons_to_believe?: string | null
          status?: string
          strategic_opportunity?: string | null
          target_audience?: string | null
          title?: string
          tone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "briefs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      competitor_group_members: {
        Row: {
          competitor_id: string
          group_id: string
        }
        Insert: {
          competitor_id: string
          group_id: string
        }
        Update: {
          competitor_id?: string
          group_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "competitor_group_members_competitor_id_fkey"
            columns: ["competitor_id"]
            isOneToOne: false
            referencedRelation: "competitors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitor_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "competitor_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      competitor_groups: {
        Row: {
          created_at: string
          id: string
          name: string
          project_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          project_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "competitor_groups_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      competitors: {
        Row: {
          brand_id: string | null
          created_at: string
          id: string
          metadata: Json
          name: string
          notes: string | null
          project_id: string
          updated_at: string
          website_url: string | null
        }
        Insert: {
          brand_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          name: string
          notes?: string | null
          project_id: string
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          brand_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          name?: string
          notes?: string | null
          project_id?: string
          updated_at?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "competitors_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitors_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      connector_configs: {
        Row: {
          config: Json
          created_at: string
          display_name: string
          enabled: boolean
          id: string
          last_synced_at: string | null
          mode: Database["public"]["Enums"]["connector_mode"]
          project_id: string
          source_kind: Database["public"]["Enums"]["source_kind"]
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          display_name: string
          enabled?: boolean
          id?: string
          last_synced_at?: string | null
          mode?: Database["public"]["Enums"]["connector_mode"]
          project_id: string
          source_kind: Database["public"]["Enums"]["source_kind"]
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          display_name?: string
          enabled?: boolean
          id?: string
          last_synced_at?: string | null
          mode?: Database["public"]["Enums"]["connector_mode"]
          project_id?: string
          source_kind?: Database["public"]["Enums"]["source_kind"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "connector_configs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      creative_territories: {
        Row: {
          audience_truth: string | null
          brand_role: string | null
          campaign_idea: string | null
          core_thought: string
          created_at: string
          cultural_connection: string | null
          id: string
          insight_id: string | null
          name: string
          possible_executions: string | null
          project_id: string
          risks: string | null
          social_content_ideas: string | null
          strategy_session_id: string | null
          tone: string | null
          updated_at: string
        }
        Insert: {
          audience_truth?: string | null
          brand_role?: string | null
          campaign_idea?: string | null
          core_thought: string
          created_at?: string
          cultural_connection?: string | null
          id?: string
          insight_id?: string | null
          name: string
          possible_executions?: string | null
          project_id: string
          risks?: string | null
          social_content_ideas?: string | null
          strategy_session_id?: string | null
          tone?: string | null
          updated_at?: string
        }
        Update: {
          audience_truth?: string | null
          brand_role?: string | null
          campaign_idea?: string | null
          core_thought?: string
          created_at?: string
          cultural_connection?: string | null
          id?: string
          insight_id?: string | null
          name?: string
          possible_executions?: string | null
          project_id?: string
          risks?: string | null
          social_content_ideas?: string | null
          strategy_session_id?: string | null
          tone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "creative_territories_insight_id_fkey"
            columns: ["insight_id"]
            isOneToOne: false
            referencedRelation: "insights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creative_territories_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creative_territories_strategy_session_id_fkey"
            columns: ["strategy_session_id"]
            isOneToOne: false
            referencedRelation: "strategy_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      insight_sources: {
        Row: {
          claim_type: Database["public"]["Enums"]["claim_kind"]
          created_at: string
          excerpt: string | null
          id: string
          insight_id: string
          source_id: string
          source_type: Database["public"]["Enums"]["item_kind"]
        }
        Insert: {
          claim_type?: Database["public"]["Enums"]["claim_kind"]
          created_at?: string
          excerpt?: string | null
          id?: string
          insight_id: string
          source_id: string
          source_type: Database["public"]["Enums"]["item_kind"]
        }
        Update: {
          claim_type?: Database["public"]["Enums"]["claim_kind"]
          created_at?: string
          excerpt?: string | null
          id?: string
          insight_id?: string
          source_id?: string
          source_type?: Database["public"]["Enums"]["item_kind"]
        }
        Relationships: [
          {
            foreignKeyName: "insight_sources_insight_id_fkey"
            columns: ["insight_id"]
            isOneToOne: false
            referencedRelation: "insights"
            referencedColumns: ["id"]
          },
        ]
      }
      insights: {
        Row: {
          behaviour: string | null
          confidence: string
          created_at: string
          created_by: string
          id: string
          insight: string
          observation: string | null
          opportunity: string | null
          project_id: string
          status: string
          tension: string | null
          title: string
          updated_at: string
        }
        Insert: {
          behaviour?: string | null
          confidence?: string
          created_at?: string
          created_by: string
          id?: string
          insight: string
          observation?: string | null
          opportunity?: string | null
          project_id: string
          status?: string
          tension?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          behaviour?: string | null
          confidence?: string
          created_at?: string
          created_by?: string
          id?: string
          insight?: string
          observation?: string | null
          opportunity?: string | null
          project_id?: string
          status?: string
          tension?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "insights_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      inspiration_items: {
        Row: {
          auto_tags: string[]
          brand_name: string | null
          client_ref: string | null
          created_at: string
          created_by: string
          extracted_text: string | null
          id: string
          item_type: string
          metadata: Json
          notes: string | null
          project_id: string
          search_vector: unknown
          thumbnail_url: string | null
          title: string
          updated_at: string
          url: string | null
        }
        Insert: {
          auto_tags?: string[]
          brand_name?: string | null
          client_ref?: string | null
          created_at?: string
          created_by?: string
          extracted_text?: string | null
          id?: string
          item_type: string
          metadata?: Json
          notes?: string | null
          project_id: string
          search_vector?: unknown
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          auto_tags?: string[]
          brand_name?: string | null
          client_ref?: string | null
          created_at?: string
          created_by?: string
          extracted_text?: string | null
          id?: string
          item_type?: string
          metadata?: Json
          notes?: string | null
          project_id?: string
          search_vector?: unknown
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inspiration_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      item_tags: {
        Row: {
          created_at: string
          id: string
          item_id: string
          item_type: Database["public"]["Enums"]["item_kind"]
          project_id: string
          tag_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          item_type: Database["public"]["Enums"]["item_kind"]
          project_id: string
          tag_id: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          item_type?: Database["public"]["Enums"]["item_kind"]
          project_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_tags_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      mention_notes: {
        Row: {
          content: string
          created_at: string
          id: string
          mention_id: string
          project_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          mention_id: string
          project_id: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          mention_id?: string
          project_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mention_notes_mention_id_fkey"
            columns: ["mention_id"]
            isOneToOne: false
            referencedRelation: "mentions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mention_notes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      mention_topics: {
        Row: {
          confidence: number | null
          mention_id: string
          topic_id: string
        }
        Insert: {
          confidence?: number | null
          mention_id: string
          topic_id: string
        }
        Update: {
          confidence?: number | null
          mention_id?: string
          topic_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mention_topics_mention_id_fkey"
            columns: ["mention_id"]
            isOneToOne: false
            referencedRelation: "mentions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mention_topics_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      mentions: {
        Row: {
          author: string | null
          comments: number
          content: string
          created_at: string
          engagement: number
          entities: Json
          external_id: string | null
          id: string
          is_important: boolean
          keywords: string[]
          language: string | null
          likes: number
          metadata: Json
          monitoring_query_id: string | null
          platform: Database["public"]["Enums"]["source_kind"]
          project_id: string
          published_at: string | null
          search_vector: unknown
          sentiment: Database["public"]["Enums"]["sentiment_kind"]
          sentiment_score: number | null
          shares: number
          source_id: string
          updated_at: string
          url: string | null
          views: number
        }
        Insert: {
          author?: string | null
          comments?: number
          content: string
          created_at?: string
          engagement?: number
          entities?: Json
          external_id?: string | null
          id?: string
          is_important?: boolean
          keywords?: string[]
          language?: string | null
          likes?: number
          metadata?: Json
          monitoring_query_id?: string | null
          platform: Database["public"]["Enums"]["source_kind"]
          project_id: string
          published_at?: string | null
          search_vector?: unknown
          sentiment?: Database["public"]["Enums"]["sentiment_kind"]
          sentiment_score?: number | null
          shares?: number
          source_id: string
          updated_at?: string
          url?: string | null
          views?: number
        }
        Update: {
          author?: string | null
          comments?: number
          content?: string
          created_at?: string
          engagement?: number
          entities?: Json
          external_id?: string | null
          id?: string
          is_important?: boolean
          keywords?: string[]
          language?: string | null
          likes?: number
          metadata?: Json
          monitoring_query_id?: string | null
          platform?: Database["public"]["Enums"]["source_kind"]
          project_id?: string
          published_at?: string | null
          search_vector?: unknown
          sentiment?: Database["public"]["Enums"]["sentiment_kind"]
          sentiment_score?: number | null
          shares?: number
          source_id?: string
          updated_at?: string
          url?: string | null
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "mentions_monitoring_query_id_fkey"
            columns: ["monitoring_query_id"]
            isOneToOne: false
            referencedRelation: "monitoring_queries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mentions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mentions_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      monitor_runs: {
        Row: {
          client_ref: string | null
          completed_at: string | null
          connector_config_id: string | null
          created_at: string
          cursor: Json | null
          error_message: string | null
          id: string
          mentions_created: number
          mentions_fetched: number
          mentions_updated: number
          monitoring_query_id: string
          project_id: string
          run_metadata: Json
          started_at: string
          status: string
          updated_at: string
        }
        Insert: {
          client_ref?: string | null
          completed_at?: string | null
          connector_config_id?: string | null
          created_at?: string
          cursor?: Json | null
          error_message?: string | null
          id?: string
          mentions_created?: number
          mentions_fetched?: number
          mentions_updated?: number
          monitoring_query_id: string
          project_id: string
          run_metadata?: Json
          started_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          client_ref?: string | null
          completed_at?: string | null
          connector_config_id?: string | null
          created_at?: string
          cursor?: Json | null
          error_message?: string | null
          id?: string
          mentions_created?: number
          mentions_fetched?: number
          mentions_updated?: number
          monitoring_query_id?: string
          project_id?: string
          run_metadata?: Json
          started_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "monitor_runs_connector_config_id_fkey"
            columns: ["connector_config_id"]
            isOneToOne: false
            referencedRelation: "connector_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monitor_runs_monitoring_query_id_fkey"
            columns: ["monitoring_query_id"]
            isOneToOne: false
            referencedRelation: "monitoring_queries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monitor_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      monitoring_queries: {
        Row: {
          brand_id: string | null
          client_ref: string | null
          created_at: string
          description: string | null
          enabled: boolean
          excluded_keywords: string[]
          id: string
          keywords: string[]
          language: string | null
          last_run_at: string | null
          market: string | null
          name: string
          parsed_query: Json | null
          platform_filters: Database["public"]["Enums"]["source_kind"][]
          project_id: string
          query: string
          updated_at: string
        }
        Insert: {
          brand_id?: string | null
          client_ref?: string | null
          created_at?: string
          description?: string | null
          enabled?: boolean
          excluded_keywords?: string[]
          id?: string
          keywords?: string[]
          language?: string | null
          last_run_at?: string | null
          market?: string | null
          name: string
          parsed_query?: Json | null
          platform_filters?: Database["public"]["Enums"]["source_kind"][]
          project_id: string
          query: string
          updated_at?: string
        }
        Update: {
          brand_id?: string | null
          client_ref?: string | null
          created_at?: string
          description?: string | null
          enabled?: boolean
          excluded_keywords?: string[]
          id?: string
          keywords?: string[]
          language?: string | null
          last_run_at?: string | null
          market?: string | null
          name?: string
          parsed_query?: Json | null
          platform_filters?: Database["public"]["Enums"]["source_kind"][]
          project_id?: string
          query?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "monitoring_queries_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monitoring_queries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      monitoring_query_competitors: {
        Row: {
          competitor_id: string
          created_at: string
          monitoring_query_id: string
        }
        Insert: {
          competitor_id: string
          created_at?: string
          monitoring_query_id: string
        }
        Update: {
          competitor_id?: string
          created_at?: string
          monitoring_query_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "monitoring_query_competitors_competitor_id_fkey"
            columns: ["competitor_id"]
            isOneToOne: false
            referencedRelation: "competitors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monitoring_query_competitors_monitoring_query_id_fkey"
            columns: ["monitoring_query_id"]
            isOneToOne: false
            referencedRelation: "monitoring_queries"
            referencedColumns: ["id"]
          },
        ]
      }
      project_members: {
        Row: {
          created_at: string
          project_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          project_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          project_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          client_ref: string | null
          created_at: string
          description: string | null
          focus: string | null
          id: string
          market: string | null
          name: string
          owner_id: string
          status: string
          updated_at: string
        }
        Insert: {
          client_ref?: string | null
          created_at?: string
          description?: string | null
          focus?: string | null
          id?: string
          market?: string | null
          name: string
          owner_id?: string
          status?: string
          updated_at?: string
        }
        Update: {
          client_ref?: string | null
          created_at?: string
          description?: string | null
          focus?: string | null
          id?: string
          market?: string | null
          name?: string
          owner_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      research_items: {
        Row: {
          ai_summary: string | null
          author: string | null
          client_ref: string | null
          collection_name: string | null
          created_at: string
          created_by: string
          id: string
          item_type: string
          key_findings: string | null
          metadata: Json
          notes: string | null
          project_id: string
          publication: string | null
          published_at: string | null
          search_vector: unknown
          title: string
          updated_at: string
          url: string | null
        }
        Insert: {
          ai_summary?: string | null
          author?: string | null
          client_ref?: string | null
          collection_name?: string | null
          created_at?: string
          created_by?: string
          id?: string
          item_type?: string
          key_findings?: string | null
          metadata?: Json
          notes?: string | null
          project_id: string
          publication?: string | null
          published_at?: string | null
          search_vector?: unknown
          title: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          ai_summary?: string | null
          author?: string | null
          client_ref?: string | null
          collection_name?: string | null
          created_at?: string
          created_by?: string
          id?: string
          item_type?: string
          key_findings?: string | null
          metadata?: Json
          notes?: string | null
          project_id?: string
          publication?: string | null
          published_at?: string | null
          search_vector?: unknown
          title?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "research_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_items: {
        Row: {
          created_at: string
          destination: string
          destination_id: string | null
          id: string
          item_id: string
          item_type: Database["public"]["Enums"]["item_kind"]
          metadata: Json
          note: string | null
          project_id: string
          source_excerpt: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          destination?: string
          destination_id?: string | null
          id?: string
          item_id: string
          item_type: Database["public"]["Enums"]["item_kind"]
          metadata?: Json
          note?: string | null
          project_id: string
          source_excerpt?: string | null
          user_id?: string
        }
        Update: {
          created_at?: string
          destination?: string
          destination_id?: string | null
          id?: string
          item_id?: string
          item_type?: Database["public"]["Enums"]["item_kind"]
          metadata?: Json
          note?: string | null
          project_id?: string
          source_excerpt?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      sources: {
        Row: {
          connector_config_id: string | null
          created_at: string
          external_id: string | null
          id: string
          kind: Database["public"]["Enums"]["source_kind"]
          metadata: Json
          mode: Database["public"]["Enums"]["connector_mode"]
          name: string
          project_id: string
          updated_at: string
          url: string | null
        }
        Insert: {
          connector_config_id?: string | null
          created_at?: string
          external_id?: string | null
          id?: string
          kind: Database["public"]["Enums"]["source_kind"]
          metadata?: Json
          mode?: Database["public"]["Enums"]["connector_mode"]
          name: string
          project_id: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          connector_config_id?: string | null
          created_at?: string
          external_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["source_kind"]
          metadata?: Json
          mode?: Database["public"]["Enums"]["connector_mode"]
          name?: string
          project_id?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sources_connector_config_id_fkey"
            columns: ["connector_config_id"]
            isOneToOne: false
            referencedRelation: "connector_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sources_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      strategy_sessions: {
        Row: {
          created_at: string
          created_by: string
          id: string
          project_id: string
          source_scope: Json
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          project_id: string
          source_scope?: Json
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          project_id?: string
          source_scope?: Json
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "strategy_sessions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      strategy_stages: {
        Row: {
          claim_type: Database["public"]["Enums"]["claim_kind"]
          content: string
          created_at: string
          id: string
          position: number
          session_id: string
          stage: string
          updated_at: string
        }
        Insert: {
          claim_type: Database["public"]["Enums"]["claim_kind"]
          content: string
          created_at?: string
          id?: string
          position: number
          session_id: string
          stage: string
          updated_at?: string
        }
        Update: {
          claim_type?: Database["public"]["Enums"]["claim_kind"]
          content?: string
          created_at?: string
          id?: string
          position?: number
          session_id?: string
          stage?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "strategy_stages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "strategy_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          color: string | null
          created_at: string
          id: string
          name: string
          project_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          name: string
          project_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      topics: {
        Row: {
          created_at: string
          description: string | null
          id: string
          metadata: Json
          name: string
          project_id: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json
          name: string
          project_id: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json
          name?: string
          project_id?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "topics_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      trend_mentions: {
        Row: {
          mention_id: string
          trend_id: string
          weight: number
        }
        Insert: {
          mention_id: string
          trend_id: string
          weight?: number
        }
        Update: {
          mention_id?: string
          trend_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "trend_mentions_mention_id_fkey"
            columns: ["mention_id"]
            isOneToOne: false
            referencedRelation: "mentions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trend_mentions_trend_id_fkey"
            columns: ["trend_id"]
            isOneToOne: false
            referencedRelation: "trends"
            referencedColumns: ["id"]
          },
        ]
      }
      trends: {
        Row: {
          audience: string | null
          created_at: string
          description: string | null
          first_detected_at: string | null
          growth_rate: number | null
          id: string
          intelligence: Json
          lifecycle: Database["public"]["Enums"]["lifecycle_stage"]
          mention_volume: number
          name: string
          platforms: Database["public"]["Enums"]["source_kind"][]
          project_id: string
          related_keywords: string[]
          score_factors: Json
          topic_id: string | null
          trend_score: number | null
          updated_at: string
        }
        Insert: {
          audience?: string | null
          created_at?: string
          description?: string | null
          first_detected_at?: string | null
          growth_rate?: number | null
          id?: string
          intelligence?: Json
          lifecycle?: Database["public"]["Enums"]["lifecycle_stage"]
          mention_volume?: number
          name: string
          platforms?: Database["public"]["Enums"]["source_kind"][]
          project_id: string
          related_keywords?: string[]
          score_factors?: Json
          topic_id?: string | null
          trend_score?: number | null
          updated_at?: string
        }
        Update: {
          audience?: string | null
          created_at?: string
          description?: string | null
          first_detected_at?: string | null
          growth_rate?: number | null
          id?: string
          intelligence?: Json
          lifecycle?: Database["public"]["Enums"]["lifecycle_stage"]
          mention_volume?: number
          name?: string
          platforms?: Database["public"]["Enums"]["source_kind"][]
          project_id?: string
          related_keywords?: string[]
          score_factors?: Json
          topic_id?: string | null
          trend_score?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trends_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trends_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          timezone: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_project: {
        Args: { target_project_id: string }
        Returns: boolean
      }
      consume_radar_quota: {
        Args: { target_user_id: string }
        Returns: {
          allowed: boolean
          remaining_day: number
          remaining_minute: number
          retry_after_seconds: number
        }[]
      }
    }
    Enums: {
      claim_kind:
        | "evidence"
        | "interpretation"
        | "hypothesis"
        | "recommendation"
      connector_mode: "live" | "unavailable"
      item_kind:
        | "mention"
        | "trend"
        | "research"
        | "inspiration"
        | "insight"
        | "territory"
        | "brief"
      lifecycle_stage:
        | "emerging"
        | "accelerating"
        | "mainstream"
        | "saturated"
        | "declining"
      sentiment_kind: "positive" | "neutral" | "negative" | "unknown"
      source_kind:
        | "reddit"
        | "youtube"
        | "rss"
        | "news"
        | "blog"
        | "manual_url"
        | "manual_note"
        | "future_connector"
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
      claim_kind: [
        "evidence",
        "interpretation",
        "hypothesis",
        "recommendation",
      ],
      connector_mode: ["live", "unavailable"],
      item_kind: [
        "mention",
        "trend",
        "research",
        "inspiration",
        "insight",
        "territory",
        "brief",
      ],
      lifecycle_stage: [
        "emerging",
        "accelerating",
        "mainstream",
        "saturated",
        "declining",
      ],
      sentiment_kind: ["positive", "neutral", "negative", "unknown"],
      source_kind: [
        "reddit",
        "youtube",
        "rss",
        "news",
        "blog",
        "manual_url",
        "manual_note",
        "future_connector",
      ],
    },
  },
} as const
