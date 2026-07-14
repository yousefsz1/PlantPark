export type Database = {
  public: {
    Tables: {
      plants: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          species: string | null;
          level: number;
          xp: number;
          health_percent: number;
          last_watered: string | null;
          created_at: string;
          watering_frequency: 'daily' | 'weekly' | 'monthly' | null;
          sunlight: 'low' | 'medium' | 'bright' | null;
          notes: string | null;
          soil_type: string | null;
          temperature_range: string | null;
          care_tip: string | null;
          photo_url: string | null;
          health_issues: string[] | null;
          health_remedies: string[] | null;
          health_tips_pro: string[] | null;
          toxic_to_humans: boolean | null;
          toxic_to_pets: boolean | null;
          human_toxicity_severity: number | null;
          pet_toxicity_severity: number | null;
          toxicity_note: string | null;
          calendar_event_id: string | null;
          max_height: string | null;
          flowering_season: string | null;
          fruiting_season: string | null;
          growing_location: 'indoor' | 'outdoor' | 'both' | null;
          space_id: string | null;
          health_status: 'healthy' | 'needs_attention' | 'critical' | null;
          health_diagnosis_issues: string | null;
          health_recommendation: string | null;
          health_checked_at: string | null;
          is_grass: boolean | null;
          lawn_length_m: number | null;
          lawn_width_m: number | null;
          lawn_area_m2: number | null;
          sun_exposure: 'full_sun' | 'partial_shade' | 'full_shade' | null;
          lawn_condition: 'healthy' | 'patchy' | 'yellowing' | 'unsure' | null;
          fertilizing_frequency_days: number | null;
          last_fertilized_at: string | null;
          mowing_frequency_days: number | null;
          last_mowed_at: string | null;
          grass_health_issues: string[] | null;
          lawn_health_level: number | null;
          lawn_health_checked_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          species?: string | null;
          level?: number;
          xp?: number;
          health_percent?: number;
          last_watered?: string | null;
          created_at?: string;
          watering_frequency?: 'daily' | 'weekly' | 'monthly' | null;
          sunlight?: 'low' | 'medium' | 'bright' | null;
          notes?: string | null;
          soil_type?: string | null;
          temperature_range?: string | null;
          care_tip?: string | null;
          photo_url?: string | null;
          health_issues?: string[] | null;
          health_remedies?: string[] | null;
          health_tips_pro?: string[] | null;
          toxic_to_humans?: boolean | null;
          toxic_to_pets?: boolean | null;
          human_toxicity_severity?: number | null;
          pet_toxicity_severity?: number | null;
          toxicity_note?: string | null;
          calendar_event_id?: string | null;
          max_height?: string | null;
          flowering_season?: string | null;
          fruiting_season?: string | null;
          growing_location?: 'indoor' | 'outdoor' | 'both' | null;
          space_id?: string | null;
          health_status?: 'healthy' | 'needs_attention' | 'critical' | null;
          health_diagnosis_issues?: string | null;
          health_recommendation?: string | null;
          health_checked_at?: string | null;
          is_grass?: boolean | null;
          lawn_length_m?: number | null;
          lawn_width_m?: number | null;
          lawn_area_m2?: number | null;
          sun_exposure?: 'full_sun' | 'partial_shade' | 'full_shade' | null;
          lawn_condition?: 'healthy' | 'patchy' | 'yellowing' | 'unsure' | null;
          fertilizing_frequency_days?: number | null;
          last_fertilized_at?: string | null;
          mowing_frequency_days?: number | null;
          last_mowed_at?: string | null;
          grass_health_issues?: string[] | null;
          lawn_health_level?: number | null;
          lawn_health_checked_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          species?: string | null;
          level?: number;
          xp?: number;
          health_percent?: number;
          last_watered?: string | null;
          created_at?: string;
          watering_frequency?: 'daily' | 'weekly' | 'monthly' | null;
          sunlight?: 'low' | 'medium' | 'bright' | null;
          notes?: string | null;
          soil_type?: string | null;
          temperature_range?: string | null;
          care_tip?: string | null;
          photo_url?: string | null;
          health_issues?: string[] | null;
          health_remedies?: string[] | null;
          health_tips_pro?: string[] | null;
          toxic_to_humans?: boolean | null;
          toxic_to_pets?: boolean | null;
          human_toxicity_severity?: number | null;
          pet_toxicity_severity?: number | null;
          toxicity_note?: string | null;
          calendar_event_id?: string | null;
          max_height?: string | null;
          flowering_season?: string | null;
          fruiting_season?: string | null;
          growing_location?: 'indoor' | 'outdoor' | 'both' | null;
          space_id?: string | null;
          health_status?: 'healthy' | 'needs_attention' | 'critical' | null;
          health_diagnosis_issues?: string | null;
          health_recommendation?: string | null;
          health_checked_at?: string | null;
          is_grass?: boolean | null;
          lawn_length_m?: number | null;
          lawn_width_m?: number | null;
          lawn_area_m2?: number | null;
          sun_exposure?: 'full_sun' | 'partial_shade' | 'full_shade' | null;
          lawn_condition?: 'healthy' | 'patchy' | 'yellowing' | 'unsure' | null;
          fertilizing_frequency_days?: number | null;
          last_fertilized_at?: string | null;
          mowing_frequency_days?: number | null;
          last_mowed_at?: string | null;
          grass_health_issues?: string[] | null;
          lawn_health_level?: number | null;
          lawn_health_checked_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'plants_space_id_fkey';
            columns: ['space_id'];
            referencedRelation: 'spaces';
            referencedColumns: ['id'];
          },
        ];
      };
      favourite_folders: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      favourites: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          species: string | null;
          photo_url: string | null;
          watering_frequency: string | null;
          sunlight: string | null;
          soil_type: string | null;
          temperature: string | null;
          care_tip: string | null;
          health_issues: string[] | null;
          health_remedies: string[] | null;
          health_tips_pro: string[] | null;
          toxic_to_humans: boolean | null;
          toxic_to_pets: boolean | null;
          human_toxicity_severity: number | null;
          pet_toxicity_severity: number | null;
          toxicity_note: string | null;
          created_at: string;
          max_height: string | null;
          flowering_season: string | null;
          fruiting_season: string | null;
          growing_location: 'indoor' | 'outdoor' | 'both' | null;
          space_id: string | null;
          health_status: 'healthy' | 'needs_attention' | 'critical' | null;
          health_diagnosis_issues: string | null;
          health_recommendation: string | null;
          health_checked_at: string | null;
          folder_id: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          species?: string | null;
          photo_url?: string | null;
          watering_frequency?: string | null;
          sunlight?: string | null;
          soil_type?: string | null;
          temperature?: string | null;
          care_tip?: string | null;
          health_issues?: string[] | null;
          health_remedies?: string[] | null;
          health_tips_pro?: string[] | null;
          toxic_to_humans?: boolean | null;
          toxic_to_pets?: boolean | null;
          human_toxicity_severity?: number | null;
          pet_toxicity_severity?: number | null;
          toxicity_note?: string | null;
          created_at?: string;
          max_height?: string | null;
          flowering_season?: string | null;
          fruiting_season?: string | null;
          growing_location?: 'indoor' | 'outdoor' | 'both' | null;
          space_id?: string | null;
          health_status?: 'healthy' | 'needs_attention' | 'critical' | null;
          health_diagnosis_issues?: string | null;
          health_recommendation?: string | null;
          health_checked_at?: string | null;
          folder_id?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          species?: string | null;
          photo_url?: string | null;
          watering_frequency?: string | null;
          sunlight?: string | null;
          soil_type?: string | null;
          temperature?: string | null;
          care_tip?: string | null;
          health_issues?: string[] | null;
          health_remedies?: string[] | null;
          health_tips_pro?: string[] | null;
          toxic_to_humans?: boolean | null;
          toxic_to_pets?: boolean | null;
          human_toxicity_severity?: number | null;
          pet_toxicity_severity?: number | null;
          toxicity_note?: string | null;
          created_at?: string;
          max_height?: string | null;
          flowering_season?: string | null;
          fruiting_season?: string | null;
          growing_location?: 'indoor' | 'outdoor' | 'both' | null;
          space_id?: string | null;
          health_status?: 'healthy' | 'needs_attention' | 'critical' | null;
          health_diagnosis_issues?: string | null;
          health_recommendation?: string | null;
          health_checked_at?: string | null;
          folder_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'favourites_space_id_fkey';
            columns: ['space_id'];
            referencedRelation: 'spaces';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'favourites_folder_id_fkey';
            columns: ['folder_id'];
            referencedRelation: 'favourite_folders';
            referencedColumns: ['id'];
          },
        ];
      };
      care_tasks: {
        Row: {
          id: string;
          plant_id: string;
          user_id: string;
          task_type: 'watering' | 'fertilizing' | 'misting';
          due_date: string;
          completed_at: string | null;
          xp_reward: number;
          interval_days: number;
          created_at: string;
          completed_via: 'user' | 'rain';
          rain_mm: number | null;
        };
        Insert: {
          id?: string;
          plant_id: string;
          user_id: string;
          task_type: 'watering' | 'fertilizing' | 'misting';
          due_date: string;
          completed_at?: string | null;
          xp_reward?: number;
          interval_days?: number;
          created_at?: string;
          completed_via?: 'user' | 'rain';
          rain_mm?: number | null;
        };
        Update: {
          id?: string;
          plant_id?: string;
          user_id?: string;
          task_type?: 'watering' | 'fertilizing' | 'misting';
          due_date?: string;
          completed_at?: string | null;
          xp_reward?: number;
          interval_days?: number;
          created_at?: string;
          completed_via?: 'user' | 'rain';
          rain_mm?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'care_tasks_plant_id_fkey';
            columns: ['plant_id'];
            referencedRelation: 'plants';
            referencedColumns: ['id'];
          },
        ];
      };
      plant_photos: {
        Row: {
          id: string;
          plant_id: string;
          user_id: string;
          photo_url: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          plant_id: string;
          user_id: string;
          photo_url: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          plant_id?: string;
          user_id?: string;
          photo_url?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'plant_photos_plant_id_fkey';
            columns: ['plant_id'];
            referencedRelation: 'plants';
            referencedColumns: ['id'];
          },
        ];
      };
      journal_entries: {
        Row: {
          id: string;
          plant_id: string | null;
          user_id: string;
          entry_type: 'added' | 'watered' | 'fertilized' | 'misted' | 'level_up' | 'health_issue' | 'note';
          message: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          plant_id?: string | null;
          user_id: string;
          entry_type: 'added' | 'watered' | 'fertilized' | 'misted' | 'level_up' | 'health_issue' | 'note';
          message: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          plant_id?: string | null;
          user_id?: string;
          entry_type?: 'added' | 'watered' | 'fertilized' | 'misted' | 'level_up' | 'health_issue' | 'note';
          message?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          total_xp: number;
          created_at: string;
          membership_tier: 'free' | 'basic' | 'pro';
          scan_count_current_period: number;
          scan_period_reset_at: string;
          latitude: number | null;
          longitude: number | null;
          location_updated_at: string | null;
          smart_watering_enabled: boolean;
          push_token: string | null;
        };
        Insert: {
          id: string;
          total_xp?: number;
          created_at?: string;
          membership_tier?: 'free' | 'basic' | 'pro';
          scan_count_current_period?: number;
          scan_period_reset_at?: string;
          latitude?: number | null;
          longitude?: number | null;
          location_updated_at?: string | null;
          smart_watering_enabled?: boolean;
          push_token?: string | null;
        };
        Update: {
          id?: string;
          total_xp?: number;
          created_at?: string;
          membership_tier?: 'free' | 'basic' | 'pro';
          scan_count_current_period?: number;
          scan_period_reset_at?: string;
          latitude?: number | null;
          longitude?: number | null;
          location_updated_at?: string | null;
          smart_watering_enabled?: boolean;
          push_token?: string | null;
        };
        Relationships: [];
      };
      spaces: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      increment_xp: {
        Args: { xp_amount: number };
        Returns: number;
      };
      complete_care_task: {
        Args: { task_id: string };
        Returns: unknown;
      };
      get_scan_status: {
        Args: Record<string, never>;
        Returns: unknown;
      };
      increment_scan_count: {
        Args: { p_amount?: number };
        Returns: number;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type Plant = Database['public']['Tables']['plants']['Row'];
export type CareTask = Database['public']['Tables']['care_tasks']['Row'];
export type Favourite = Database['public']['Tables']['favourites']['Row'];
export type FavouriteFolder = Database['public']['Tables']['favourite_folders']['Row'];
export type Space = Database['public']['Tables']['spaces']['Row'];

export type PlantPhoto = Database['public']['Tables']['plant_photos']['Row'];

export type CareTaskWithPlant = CareTask & {
  plants: { id: string; name: string } | null;
};

export type CareTaskWithPlantPhoto = CareTask & {
  plants: { id: string; name: string; photo_url: string | null; space_id: string | null } | null;
};

export type JournalEntry = Database['public']['Tables']['journal_entries']['Row'];
export type JournalEntryWithPlant = JournalEntry & {
  plants: { id: string; name: string; photo_url: string | null } | null;
};
