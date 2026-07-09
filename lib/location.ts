import * as Location from 'expo-location';
import { supabase } from './supabase';

export type GeocodeResult = {
  name: string;
  admin1?: string;
  country?: string;
  latitude: number;
  longitude: number;
};

async function saveLocation(latitude: number, longitude: number): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('profiles')
    .update({ latitude, longitude, location_updated_at: new Date().toISOString() })
    .eq('id', user.id);
  if (error) throw error;
}

// Requests foreground location permission and stores the device's current
// coordinates on the user's profile. Throws if permission is denied or the
// position can't be determined — callers should fall back to city search.
export async function useDeviceLocation(): Promise<{ latitude: number; longitude: number }> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Location permission denied');
  }

  const position = await Location.getCurrentPositionAsync({});
  const { latitude, longitude } = position.coords;
  await saveLocation(latitude, longitude);
  return { latitude, longitude };
}

// Manual fallback — free Open-Meteo geocoding, no key required, consistent
// with the rest of Smart Watering's data sources.
export async function searchCity(query: string): Promise<GeocodeResult[]> {
  if (!query.trim()) return [];
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=en&format=json`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.results ?? []).map((r: any) => ({
    name: r.name,
    admin1: r.admin1,
    country: r.country,
    latitude: r.latitude,
    longitude: r.longitude,
  }));
}

export async function setManualLocation(latitude: number, longitude: number): Promise<void> {
  await saveLocation(latitude, longitude);
}
