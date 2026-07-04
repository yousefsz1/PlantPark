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
        };
        Relationships: [];
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
        };
        Insert: {
          id: string;
          total_xp?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          total_xp?: number;
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
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type Plant = Database['public']['Tables']['plants']['Row'];
export type CareTask = Database['public']['Tables']['care_tasks']['Row'];
export type Favourite = Database['public']['Tables']['favourites']['Row'];

export type PlantPhoto = Database['public']['Tables']['plant_photos']['Row'];

export type CareTaskWithPlant = CareTask & {
  plants: { id: string; name: string } | null;
};

export type CareTaskWithPlantPhoto = CareTask & {
  plants: { id: string; name: string; photo_url: string | null } | null;
};

export type JournalEntry = Database['public']['Tables']['journal_entries']['Row'];
export type JournalEntryWithPlant = JournalEntry & {
  plants: { id: string; name: string; photo_url: string | null } | null;
};
