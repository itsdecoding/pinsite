export interface NicheImageSet {
  hero: string;
  tilts: [string, string];
  services: string[];
  founder: string;
  location: string;
}

export const NICHE_IMAGE_SETS: Record<string, NicheImageSet> = {
  roofing: {
    hero: "https://images.unsplash.com/photo-1632759145351-1d592919f522?auto=format&fit=crop&w=1600&q=80",
    tilts: [
      "https://images.unsplash.com/photo-1590381105924-c72589b9ef3f?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=800&q=80",
    ],
    services: [
      "https://images.unsplash.com/photo-1632759145351-1d592919f522?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1541888946425-d0fbb186156f?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1581094794329-c8112a89af12?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1590381105924-c72589b9ef3f?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=800&q=80",
    ],
    founder: "https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=800&q=80",
    location: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=800&q=80",
  },
  dental: {
    hero: "/joshi-clinic/assets/hero/chair-wide.jpg",
    tilts: [
      "/joshi-clinic/assets/maps/photo-c.jpg",
      "/joshi-clinic/assets/maps/photo-d.jpg",
    ],
    services: [
      "/joshi-clinic/assets/treatments/root-canal.jpg",
      "/joshi-clinic/assets/treatments/caps-crowns.jpg",
      "/joshi-clinic/assets/treatments/dentures.jpg",
      "/joshi-clinic/assets/treatments/fillings.jpg",
      "/joshi-clinic/assets/treatments/scaling.jpg",
      "/joshi-clinic/assets/treatments/kids.jpg",
    ],
    founder: "/joshi-clinic/assets/doctor-placeholder.png",
    location: "/joshi-clinic/assets/signboard.png",
  },
  detailing: {
    hero: "https://images.unsplash.com/photo-1601362840469-51e4d8d58785?auto=format&fit=crop&w=1600&q=80",
    tilts: [
      "https://images.unsplash.com/photo-1607860108855-64acf2078ed9?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1520340356584-f9917d1eea6f?auto=format&fit=crop&w=800&q=80",
    ],
    services: [
      "https://images.unsplash.com/photo-1601362840469-51e4d8d58785?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1607860108855-64acf2078ed9?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1520340356584-f9917d1eea6f?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1507136566006-cfc505b114fc?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1580273916550-e323be2ae537?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=800&q=80",
    ],
    founder: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=800&q=80",
    location: "https://images.unsplash.com/photo-1580273916550-e323be2ae537?auto=format&fit=crop&w=800&q=80",
  },
  legal: {
    hero: "https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=1600&q=80",
    tilts: [
      "https://images.unsplash.com/photo-1453728013993-6d66e9c9123a?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1450133064473-71024230f91b?auto=format&fit=crop&w=800&q=80",
    ],
    services: [
      "https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1450133064473-71024230f91b?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1453728013993-6d66e9c9123a?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1521791136064-7986c2920216?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1507679799987-c73779587ccf?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=800&q=80",
    ],
    founder: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=800&q=80",
    location: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=800&q=80",
  },
  default: {
    hero: "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1600&q=80",
    tilts: [
      "https://images.unsplash.com/photo-1497215728101-856f4ea42174?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=800&q=80",
    ],
    services: [
      "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1497215728101-856f4ea42174?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1557804506-669a67965ba0?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1542744173-8e7e53415bb0?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=800&q=80",
    ],
    founder: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=800&q=80",
    location: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=800&q=80",
  },
};

export function resolveNicheImages(niche: string): NicheImageSet {
  const n = niche.toLowerCase();
  if (n.includes("roof") || n.includes("construct") || n.includes("hvac") || n.includes("plumb")) {
    return NICHE_IMAGE_SETS.roofing;
  }
  if (n.includes("dent") || n.includes("clinic") || n.includes("doctor") || n.includes("physio")) {
    return NICHE_IMAGE_SETS.dental;
  }
  if (n.includes("detail") || n.includes("auto") || n.includes("car") || n.includes("tint")) {
    return NICHE_IMAGE_SETS.detailing;
  }
  if (n.includes("law") || n.includes("attorney") || n.includes("legal") || n.includes("estate")) {
    return NICHE_IMAGE_SETS.legal;
  }
  return NICHE_IMAGE_SETS.default;
}
