import { create } from 'zustand';
import { api } from '@/lib/api';

interface LocationState {
  selectedLocation: string;
  locations: string[];
  setSelectedLocation: (location: string) => void;
  fetchLocations: () => Promise<void>;
}

export const useLocationStore = create<LocationState>((set) => ({
  selectedLocation: 'ALL',
  locations: [],
  setSelectedLocation: (location) => set({ selectedLocation: location }),
  fetchLocations: async () => {
    try {
      const data = await api.getLocations();
      set({ locations: data });
    } catch (error) {
      console.error('Failed to fetch locations', error);
    }
  },
}));