export interface BookingService {
  id: string;
  name: string;
  description: string;
  duration: number;
  price: number;
  category: string;
  categoryColor?: string | null;
  categoryIcon?: string | null;
}

export interface BookingCategory {
  name: string;
  color?: string | null;
  icon?: string | null;
}

export interface BookingLoyalty {
  enabled: boolean;
  threshold: number;
  rewardDescription: string;
}

export interface BookingBusiness {
  name: string;
  tagline: string;
  phone: string;
  whatsapp: string;
  instagram: string;
  address: string;
  currencySymbol: string;
  timezone: string;
}

export interface BookingConfig {
  booking: {
    enabled: boolean;
    openTime: string;
    closeTime: string;
    openDays: number[];
    advanceDays: number;
    minimumLeadMinutes: number;
    stylist: { name: string; role: string };
    policies: string[];
  };
  business: BookingBusiness;
  loyalty: BookingLoyalty;
  services: BookingService[];
  categories: BookingCategory[];
}

export interface TimeSlot {
  id: string;
  time: string;
  available: boolean;
}

export interface ClientProfile {
  id: string;
  name: string;
  visits: number;
  loyalty_points: number;
  progressInCycle: number;
  loyaltyThreshold: number;
}

export interface PublicAppointment {
  id: string;
  appointment_number: string;
  customer_name: string;
  customer_phone: string;
  date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  total_price: number;
  status: string;
}

export interface AgendaAppointment extends PublicAppointment {
  customer_id?: string | null;
  stylist_id?: string | null;
  source: 'online' | 'pos' | string;
  notes?: string | null;
  cancellation_reason?: string | null;
  order_id?: number | null;
  items: {
    id: number;
    product_id: string | null;
    product_name: string;
    price: number;
    duration_minutes: number;
  }[];
  customer?: { id: string; name: string; phone?: string } | null;
  order?: { id: number; order_number: string; status: string; total: number } | null;
}

export interface AgendaSummary {
  date: string;
  total: number;
  confirmed: number;
  checked_in: number;
  completed: number;
  cancelled: number;
  expected_revenue: number;
}
