export interface Message {
  role: 'user' | 'model';
  content: string;
  timestamp: number;
}

export interface LocationData {
  lat: number;
  lng: number;
  placeName?: string;
}

export interface JournalEntry {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
  summary: string;
  category: string;
  mood: string;
  isDraft: boolean;
  location?: LocationData;
  /**
   * Unit-length gemini-embedding-001 vector (768 dims) of the entry's text,
   * written when the entry is synthesized. Powers semantic memory search.
   */
  embedding?: number[];
}

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  role?: 'admin' | 'user';
}
