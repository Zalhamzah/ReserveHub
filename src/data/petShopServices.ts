export interface PetShopService {
  id: string;
  name: string;
  description: string;
  duration: number; // minutes
  price: number;
  category: 'GROOMING' | 'VETERINARY' | 'TRAINING' | 'DAYCARE' | 'WELLNESS' | 'SPECIALTY';
  petTypes: string[]; // ['dog', 'cat', 'bird', 'rabbit', etc.]
  requirements?: string[];
  additionalInfo?: string;
}

export interface PetHotelRoom {
  id: string;
  name: string;
  description: string;
  pricePerNight: number;
  roomType: 'STANDARD' | 'DELUXE' | 'PREMIUM' | 'VIP';
  petTypes: string[];
  maxPets: number;
  amenities: string[];
  imageUrl?: string;
}

export interface PetHotelStayOption {
  id: string;
  name: string;
  minNights: number;
  maxNights: number;
  discountPercentage?: number; // for longer stays
}

// Pet Services (6 categories)
export const PET_SHOP_SERVICES: PetShopService[] = [
  // GROOMING SERVICES
  {
    id: 'grooming-basic-dog',
    name: 'Basic Dog Grooming',
    description: 'Full service grooming: bath, dry, nail trim, ear cleaning',
    duration: 120, // 2 hours
    price: 65,
    category: 'GROOMING',
    petTypes: ['dog'],
    requirements: ['Up-to-date vaccinations', 'Friendly temperament'],
    additionalInfo: 'Includes nail trimming and ear cleaning'
  },
  {
    id: 'grooming-premium-dog',
    name: 'Premium Dog Grooming',
    description: 'Deluxe grooming with styling, teeth brushing, cologne',
    duration: 180, // 3 hours
    price: 95,
    category: 'GROOMING',
    petTypes: ['dog'],
    requirements: ['Up-to-date vaccinations', 'Previous grooming experience'],
    additionalInfo: 'Includes styling, teeth brushing, and premium cologne'
  },
  {
    id: 'grooming-cat',
    name: 'Cat Grooming',
    description: 'Gentle grooming: bath, brush, nail trim',
    duration: 90,
    price: 55,
    category: 'GROOMING',
    petTypes: ['cat'],
    requirements: ['Up-to-date vaccinations', 'Calm temperament'],
    additionalInfo: 'Specialized for feline comfort and safety'
  },
  {
    id: 'grooming-small-pet',
    name: 'Small Pet Grooming',
    description: 'Grooming for rabbits, guinea pigs, small animals',
    duration: 60,
    price: 35,
    category: 'GROOMING',
    petTypes: ['rabbit', 'guinea pig', 'ferret'],
    requirements: ['Gentle handling required'],
    additionalInfo: 'Nail trimming and gentle brushing'
  },

  // VETERINARY SERVICES
  {
    id: 'vet-health-checkup',
    name: 'Health Check-up',
    description: 'Comprehensive health examination by licensed veterinarian',
    duration: 45,
    price: 85,
    category: 'VETERINARY',
    petTypes: ['dog', 'cat', 'rabbit', 'bird', 'guinea pig'],
    additionalInfo: 'Includes weight check, temperature, basic examination'
  },
  {
    id: 'vet-vaccination',
    name: 'Vaccination Package',
    description: 'Essential vaccinations based on pet type and age',
    duration: 30,
    price: 120,
    category: 'VETERINARY',
    petTypes: ['dog', 'cat', 'rabbit'],
    requirements: ['Health check-up within 6 months'],
    additionalInfo: 'Includes core vaccines and documentation'
  },
  {
    id: 'vet-dental',
    name: 'Dental Cleaning',
    description: 'Professional dental cleaning under sedation',
    duration: 180,
    price: 350,
    category: 'VETERINARY',
    petTypes: ['dog', 'cat'],
    requirements: ['Pre-anesthetic bloodwork', 'Fasting required'],
    additionalInfo: 'Includes dental X-rays and tooth polishing'
  },
  {
    id: 'vet-microchip',
    name: 'Microchip Insertion',
    description: 'Permanent identification microchip implantation',
    duration: 15,
    price: 45,
    category: 'VETERINARY',
    petTypes: ['dog', 'cat', 'rabbit'],
    additionalInfo: 'Includes registration with national database'
  },

  // TRAINING SERVICES
  {
    id: 'training-basic',
    name: 'Basic Obedience Training',
    description: 'Foundation training: sit, stay, come commands',
    duration: 60,
    price: 65,
    category: 'TRAINING',
    petTypes: ['dog'],
    requirements: ['Age 4+ months', 'Basic vaccinations'],
    additionalInfo: 'Group or individual sessions available'
  },
  {
    id: 'training-puppy',
    name: 'Puppy Socialization Class',
    description: 'Socialization and basic manners for puppies',
    duration: 90,
    price: 55,
    category: 'TRAINING',
    petTypes: ['dog'],
    requirements: ['Age 8-16 weeks', 'First set of vaccines'],
    additionalInfo: 'Group class with other puppies'
  },
  {
    id: 'training-behavioral',
    name: 'Behavioral Consultation',
    description: 'One-on-one consultation for behavioral issues',
    duration: 90,
    price: 125,
    category: 'TRAINING',
    petTypes: ['dog', 'cat'],
    requirements: ['Recent vet check', 'Detailed behavior history'],
    additionalInfo: 'Includes customized training plan'
  },

  // DAYCARE SERVICES
  {
    id: 'daycare-half-day',
    name: 'Dog Daycare (Half Day)',
    description: 'Supervised play and socialization for 4 hours',
    duration: 240,
    price: 35,
    category: 'DAYCARE',
    petTypes: ['dog'],
    requirements: ['Up-to-date vaccinations', 'Dog-friendly temperament', 'Daycare evaluation'],
    additionalInfo: 'Includes supervised play, rest time, and snacks'
  },
  {
    id: 'daycare-full-day',
    name: 'Dog Daycare (Full Day)',
    description: 'All-day care with play, meals, and rest',
    duration: 480,
    price: 55,
    category: 'DAYCARE',
    petTypes: ['dog'],
    requirements: ['Up-to-date vaccinations', 'Dog-friendly temperament', 'Daycare evaluation'],
    additionalInfo: 'Includes meals, supervised play, and rest periods'
  },
  {
    id: 'daycare-cat',
    name: 'Cat Daycare',
    description: 'Comfortable cat-only environment with enrichment',
    duration: 480,
    price: 40,
    category: 'DAYCARE',
    petTypes: ['cat'],
    requirements: ['Up-to-date vaccinations', 'Calm temperament'],
    additionalInfo: 'Quiet environment with climbing trees and toys'
  },

  // WELLNESS SERVICES
  {
    id: 'wellness-nail-trim',
    name: 'Nail Trimming',
    description: 'Professional nail trimming for all pets',
    duration: 20,
    price: 15,
    category: 'WELLNESS',
    petTypes: ['dog', 'cat', 'rabbit', 'guinea pig', 'bird'],
    additionalInfo: 'Quick and stress-free nail care'
  },
  {
    id: 'wellness-flea-treatment',
    name: 'Flea & Tick Treatment',
    description: 'Professional flea and tick prevention treatment',
    duration: 30,
    price: 45,
    category: 'WELLNESS',
    petTypes: ['dog', 'cat'],
    requirements: ['Recent health check recommended'],
    additionalInfo: 'Includes application and aftercare instructions'
  },
  {
    id: 'wellness-ear-cleaning',
    name: 'Ear Cleaning',
    description: 'Gentle ear cleaning and health check',
    duration: 15,
    price: 20,
    category: 'WELLNESS',
    petTypes: ['dog', 'cat', 'rabbit'],
    additionalInfo: 'Prevents infections and maintains ear health'
  },
  {
    id: 'wellness-weight-management',
    name: 'Weight Management Consultation',
    description: 'Nutrition and exercise plan for overweight pets',
    duration: 45,
    price: 75,
    category: 'WELLNESS',
    petTypes: ['dog', 'cat', 'rabbit'],
    requirements: ['Recent vet examination'],
    additionalInfo: 'Includes diet plan and follow-up schedule'
  },

  // SPECIALTY SERVICES
  {
    id: 'specialty-bird-wing-clip',
    name: 'Bird Wing Clipping',
    description: 'Professional wing clipping for birds',
    duration: 20,
    price: 25,
    category: 'SPECIALTY',
    petTypes: ['bird', 'parrot', 'cockatiel', 'canary'],
    requirements: ['Recent vet check recommended'],
    additionalInfo: 'Safe flight control with proper technique'
  },
  {
    id: 'specialty-exotic-care',
    name: 'Exotic Pet Health Check',
    description: 'Specialized care for exotic and unusual pets',
    duration: 60,
    price: 120,
    category: 'SPECIALTY',
    petTypes: ['ferret', 'hedgehog', 'chinchilla', 'reptile'],
    requirements: ['Species-specific experience'],
    additionalInfo: 'Specialized knowledge for unique pet needs'
  },
  {
    id: 'specialty-senior-care',
    name: 'Senior Pet Wellness',
    description: 'Comprehensive care program for aging pets',
    duration: 75,
    price: 110,
    category: 'SPECIALTY',
    petTypes: ['dog', 'cat'],
    requirements: ['Age 7+ years'],
    additionalInfo: 'Includes mobility assessment and comfort plan'
  },
  {
    id: 'specialty-puppy-package',
    name: 'New Puppy Package',
    description: 'Complete starter package for new puppies',
    duration: 90,
    price: 150,
    category: 'SPECIALTY',
    petTypes: ['dog'],
    requirements: ['Age 8-16 weeks'],
    additionalInfo: 'Health check, first grooming, and training basics'
  }
];

// Pet Hotel System (Separate from services)
export const PET_HOTEL_ROOMS: PetHotelRoom[] = [
  {
    id: 'room-standard-dog',
    name: 'Standard Dog Room',
    description: 'Comfortable accommodation with basic amenities',
    pricePerNight: 45,
    roomType: 'STANDARD',
    petTypes: ['dog'],
    maxPets: 1,
    amenities: ['Comfortable bedding', 'Food and water bowls', 'Daily exercise', 'Feeding service']
  },
  {
    id: 'room-deluxe-dog',
    name: 'Deluxe Dog Suite',
    description: 'Spacious room with premium amenities and extra attention',
    pricePerNight: 65,
    roomType: 'DELUXE',
    petTypes: ['dog'],
    maxPets: 1,
    amenities: ['Premium bedding', 'Extra playtime', 'Grooming touch-up', 'Treat service', 'Daily photos']
  },
  {
    id: 'room-premium-dog',
    name: 'Premium Dog Villa',
    description: 'Large private space with outdoor access',
    pricePerNight: 85,
    roomType: 'PREMIUM',
    petTypes: ['dog'],
    maxPets: 2,
    amenities: ['Private outdoor run', 'Premium meals', 'Personal attention', 'Daily grooming', 'Video calls']
  },
  {
    id: 'room-vip-dog',
    name: 'VIP Dog Palace',
    description: 'Luxury accommodation with 24/7 care and spa services',
    pricePerNight: 120,
    roomType: 'VIP',
    petTypes: ['dog'],
    maxPets: 2,
    amenities: ['Luxury furniture', '24/7 staff', 'Spa services', 'Gourmet meals', 'Private play sessions', 'Daily reports']
  },
  {
    id: 'room-standard-cat',
    name: 'Standard Cat Room',
    description: 'Quiet, comfortable space designed for cats',
    pricePerNight: 35,
    roomType: 'STANDARD',
    petTypes: ['cat'],
    maxPets: 1,
    amenities: ['Climbing tree', 'Cozy hiding spots', 'Feeding service', 'Litter maintenance']
  },
  {
    id: 'room-deluxe-cat',
    name: 'Deluxe Cat Suite',
    description: 'Multi-level cat paradise with enrichment activities',
    pricePerNight: 50,
    roomType: 'DELUXE',
    petTypes: ['cat'],
    maxPets: 1,
    amenities: ['Multi-level climbing', 'Interactive toys', 'Window views', 'Premium food', 'Daily playtime']
  },
  {
    id: 'room-small-pet',
    name: 'Small Pet Habitat',
    description: 'Specialized accommodation for small animals',
    pricePerNight: 25,
    roomType: 'STANDARD',
    petTypes: ['rabbit', 'guinea pig', 'hamster', 'ferret'],
    maxPets: 2,
    amenities: ['Species-appropriate habitat', 'Specialized diet', 'Exercise area', 'Climate control']
  }
];

export const PET_HOTEL_STAY_OPTIONS: PetHotelStayOption[] = [
  {
    id: 'stay-1-night',
    name: '1 Night',
    minNights: 1,
    maxNights: 1
  },
  {
    id: 'stay-2-3-nights',
    name: '2-3 Nights (Weekend)',
    minNights: 2,
    maxNights: 3,
    discountPercentage: 5
  },
  {
    id: 'stay-4-7-nights',
    name: '4-7 Nights (Week)',
    minNights: 4,
    maxNights: 7,
    discountPercentage: 10
  },
  {
    id: 'stay-1-2-weeks',
    name: '1-2 Weeks',
    minNights: 8,
    maxNights: 14,
    discountPercentage: 15
  },
  {
    id: 'stay-long-term',
    name: 'Long Term (15+ nights)',
    minNights: 15,
    maxNights: 365,
    discountPercentage: 20
  }
];

// Helper functions
export const getServicesByCategory = (category: PetShopService['category']): PetShopService[] => {
  return PET_SHOP_SERVICES.filter(service => service.category === category);
};

export const getServicesByPetType = (petType: string): PetShopService[] => {
  return PET_SHOP_SERVICES.filter(service => service.petTypes.includes(petType));
};

export const getHotelRoomsByPetType = (petType: string): PetHotelRoom[] => {
  return PET_HOTEL_ROOMS.filter(room => room.petTypes.includes(petType));
};

export const getHotelRoomsByType = (roomType: PetHotelRoom['roomType']): PetHotelRoom[] => {
  return PET_HOTEL_ROOMS.filter(room => room.roomType === roomType);
};

export const getAllServiceCategories = (): string[] => {
  return ['GROOMING', 'VETERINARY', 'TRAINING', 'DAYCARE', 'WELLNESS', 'SPECIALTY'];
};

export const getAllPetTypes = (): string[] => {
  const allTypes = new Set<string>();
  PET_SHOP_SERVICES.forEach(service => {
    service.petTypes.forEach(type => allTypes.add(type));
  });
  return Array.from(allTypes);
};

export const calculateHotelStayPrice = (room: PetHotelRoom, nights: number): number => {
  const stayOption = PET_HOTEL_STAY_OPTIONS.find(option => 
    nights >= option.minNights && nights <= option.maxNights
  );
  
  const basePrice = room.pricePerNight * nights;
  const discount = stayOption?.discountPercentage || 0;
  
  return Math.round(basePrice * (1 - discount / 100));
}; 