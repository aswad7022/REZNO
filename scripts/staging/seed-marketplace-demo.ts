import { PrismaClient } from "@prisma/client";
import type { BusinessVertical, PrismaClient as PrismaClientType } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const CONFIRMATION_ENV_NAME = "STAGING_SEED_CONFIRM";
const CONFIRMATION_VALUE = "REZNO_STAGING_ONLY";
const DATABASE_URL_ENV_NAME = "DATABASE_URL";

type SeedCategory = {
  name: string;
  slug: string;
  icon: string;
};

type SeedBusiness = {
  name: string;
  slug: string;
  vertical: BusinessVertical;
  profileCategory: string;
  description: string;
  branch: {
    name: string;
    slug: string;
    city: string;
    country: string;
    locationLabel: string;
    nearbyLandmark: string;
    latitude: string;
    longitude: string;
  };
  category: SeedCategory;
  service: {
    name: string;
    description: string;
    price: string;
    durationMinutes: number;
  };
  restaurant?: {
    table: {
      name: string;
      code: string;
      capacity: number;
      area: string;
    };
    menuCategory: {
      name: string;
      description: string;
    };
    menuItem: {
      name: string;
      description: string;
      price: string;
      preparationMinutes: number;
    };
  };
};

const seedBusinesses: SeedBusiness[] = [
  {
    name: "Noura Beauty Lounge",
    slug: "noura-beauty-lounge",
    vertical: "BEAUTY",
    profileCategory: "صالونات",
    description: "صالون تجميلي تجريبي لبيانات سوق REZNO على بيئة staging.",
    branch: {
      name: "Noura Beauty Lounge - Baghdad",
      slug: "baghdad-main",
      city: "Baghdad",
      country: "Iraq",
      locationLabel: "Baghdad staging demo branch",
      nearbyLandmark: "Near Karrada",
      latitude: "33.315241",
      longitude: "44.366067",
    },
    category: {
      name: "صالونات",
      slug: "beauty",
      icon: "salon",
    },
    service: {
      name: "قص شعر",
      description: "خدمة تجريبية عامة لاختبار ظهور الصالون في سوق staging.",
      price: "250.00",
      durationMinutes: 30,
    },
  },
  {
    name: "Mat3am Gold",
    slug: "mat3am-gold",
    vertical: "RESTAURANT",
    profileCategory: "مطاعم",
    description: "مطعم تجريبي لاختبار ظهور المطاعم والقوائم في سوق staging.",
    branch: {
      name: "Mat3am Gold - Baghdad",
      slug: "baghdad-main",
      city: "Baghdad",
      country: "Iraq",
      locationLabel: "Baghdad staging restaurant branch",
      nearbyLandmark: "Near Mansour",
      latitude: "33.319220",
      longitude: "44.344418",
    },
    category: {
      name: "مطاعم",
      slug: "restaurant",
      icon: "restaurant",
    },
    service: {
      name: "حجز طاولة",
      description: "خدمة تجريبية تساعد فلاتر التصنيف على إظهار المطاعم في staging.",
      price: "800.00",
      durationMinutes: 60,
    },
    restaurant: {
      table: {
        name: "Staging Table 1",
        code: "STG-T1",
        capacity: 4,
        area: "Main Hall",
      },
      menuCategory: {
        name: "Staging Menu",
        description: "قائمة تجريبية آمنة لاختبار ظهور المطعم.",
      },
      menuItem: {
        name: "طبق تجربة",
        description: "عنصر قائمة تجريبي غير مرتبط بمدفوعات أو طلبات حقيقية.",
        price: "800.00",
        preparationMinutes: 20,
      },
    },
  },
  {
    name: "Smile Studio Clinic",
    slug: "smile-studio-clinic",
    vertical: "DENTIST",
    profileCategory: "عيادات",
    description: "عيادة أسنان تجريبية لاختبار بيانات سوق REZNO على staging.",
    branch: {
      name: "Smile Studio Clinic - Baghdad",
      slug: "baghdad-main",
      city: "Baghdad",
      country: "Iraq",
      locationLabel: "Baghdad staging dental branch",
      nearbyLandmark: "Near Jadriya",
      latitude: "33.279606",
      longitude: "44.377136",
    },
    category: {
      name: "عيادات",
      slug: "dental",
      icon: "clinic",
    },
    service: {
      name: "فحص أسنان",
      description: "خدمة تجريبية عامة لاختبار ظهور العيادة في سوق staging.",
      price: "500.00",
      durationMinutes: 45,
    },
  },
];

async function main() {
  const safety = validateStagingSafety();
  console.log("Staging marketplace seed safety gates passed.");
  console.log(
    `Target database summary: host=${safety.host}; database=${safety.databaseName}`,
  );

  const pool = new Pool({ connectionString: safety.databaseUrl });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const results = [];
    for (const business of seedBusinesses) {
      results.push(await upsertBusiness(prisma, business));
    }

    console.log("Staging marketplace demo seed completed.");
    console.log(
      `Created/updated ${results.length} demo businesses: ${results
        .map((result) => result.slug)
        .join(", ")}`,
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

function validateStagingSafety() {
  const databaseUrl = process.env[DATABASE_URL_ENV_NAME];
  const confirmation = process.env[CONFIRMATION_ENV_NAME];

  if (!databaseUrl) {
    throw new Error(
      `STAGING DB ACCESS BLOCKER: ${DATABASE_URL_ENV_NAME} is not available in this process.`,
    );
  }

  if (confirmation !== CONFIRMATION_VALUE) {
    throw new Error(
      `STAGING DB SAFETY BLOCKER: ${CONFIRMATION_ENV_NAME} must equal ${CONFIRMATION_VALUE}.`,
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error(
      `STAGING DB SAFETY BLOCKER: ${DATABASE_URL_ENV_NAME} is not a valid database URL.`,
    );
  }

  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error(
      "STAGING DB SAFETY BLOCKER: database protocol must be postgres/postgresql.",
    );
  }

  const host = parsed.hostname || "unknown-host";
  const databaseName = decodeURIComponent(
    parsed.pathname.replace(/^\//, "") || "unknown-database",
  );
  const targetFingerprint = [
    parsed.hostname,
    parsed.pathname,
    parsed.searchParams.get("options") ?? "",
    parsed.searchParams.get("project") ?? "",
    parsed.searchParams.get("schema") ?? "",
  ]
    .join(" ")
    .toLowerCase();

  const productionMarkers = ["production", "prod", "live"];
  const stagingMarkers = ["staging", "stage"];

  if (productionMarkers.some((marker) => targetFingerprint.includes(marker))) {
    throw new Error(
      "STAGING DB SAFETY BLOCKER: target database contains a production-like marker.",
    );
  }

  if (!stagingMarkers.some((marker) => targetFingerprint.includes(marker))) {
    throw new Error(
      "STAGING DB SAFETY BLOCKER: target host/database must contain an explicit staging marker.",
    );
  }

  return { databaseUrl, host, databaseName };
}

async function upsertBusiness(prisma: PrismaClientType, business: SeedBusiness) {
  const organization = await prisma.organization.upsert({
    where: { slug: business.slug },
    create: {
      name: business.name,
      slug: business.slug,
      status: "ACTIVE",
      businessType: "PHYSICAL",
      vertical: business.vertical,
      isVerified: true,
      isActive: true,
      deletedAt: null,
    },
    update: {
      name: business.name,
      status: "ACTIVE",
      businessType: "PHYSICAL",
      vertical: business.vertical,
      isVerified: true,
      isActive: true,
      deletedAt: null,
    },
  });

  await prisma.organizationSettings.upsert({
    where: { organizationId: organization.id },
    create: {
      organizationId: organization.id,
      bookingEnabled: true,
      marketplaceVisible: true,
      staffSelectionMode: "OPTIONAL",
      allowOnlinePayments: false,
      cancellationWindowHours: 24,
    },
    update: {
      bookingEnabled: true,
      marketplaceVisible: true,
      staffSelectionMode: "OPTIONAL",
      allowOnlinePayments: false,
      cancellationWindowHours: 24,
    },
  });

  await prisma.businessProfile.upsert({
    where: { organizationId: organization.id },
    create: {
      organizationId: organization.id,
      businessCategory: business.profileCategory,
      description: business.description,
    },
    update: {
      businessCategory: business.profileCategory,
      description: business.description,
    },
  });

  const branch = await prisma.branch.upsert({
    where: {
      organizationId_slug: {
        organizationId: organization.id,
        slug: business.branch.slug,
      },
    },
    create: {
      organizationId: organization.id,
      name: business.branch.name,
      slug: business.branch.slug,
      status: "ACTIVE",
      city: business.branch.city,
      country: business.branch.country,
      timezone: "Asia/Baghdad",
      latitude: business.branch.latitude,
      longitude: business.branch.longitude,
      locationLabel: business.branch.locationLabel,
      nearbyLandmark: business.branch.nearbyLandmark,
      deletedAt: null,
    },
    update: {
      name: business.branch.name,
      status: "ACTIVE",
      city: business.branch.city,
      country: business.branch.country,
      timezone: "Asia/Baghdad",
      latitude: business.branch.latitude,
      longitude: business.branch.longitude,
      locationLabel: business.branch.locationLabel,
      nearbyLandmark: business.branch.nearbyLandmark,
      deletedAt: null,
    },
  });

  const category = await prisma.category.upsert({
    where: { slug: business.category.slug },
    create: business.category,
    update: {
      name: business.category.name,
      icon: business.category.icon,
    },
  });

  const service = await upsertService(prisma, {
    organizationId: organization.id,
    categoryId: category.id,
    name: business.service.name,
    description: business.service.description,
  });

  await prisma.branchService.upsert({
    where: {
      branchId_serviceId: {
        branchId: branch.id,
        serviceId: service.id,
      },
    },
    create: {
      branchId: branch.id,
      serviceId: service.id,
      price: business.service.price,
      pricingType: "FIXED",
      durationMinutes: business.service.durationMinutes,
      isAvailable: true,
    },
    update: {
      price: business.service.price,
      pricingType: "FIXED",
      durationMinutes: business.service.durationMinutes,
      isAvailable: true,
    },
  });

  if (business.restaurant) {
    await upsertRestaurantData(prisma, {
      businessId: organization.id,
      branchId: branch.id,
      restaurant: business.restaurant,
    });
  }

  return {
    id: organization.id,
    slug: organization.slug,
    branchSlug: branch.slug,
    categorySlug: category.slug,
    serviceName: service.name,
  };
}

async function upsertService(
  prisma: PrismaClientType,
  input: {
    organizationId: string;
    categoryId: string;
    name: string;
    description: string;
  },
) {
  const existing = await prisma.service.findFirst({
    where: {
      organizationId: input.organizationId,
      name: input.name,
    },
  });

  if (existing) {
    return prisma.service.update({
      where: { id: existing.id },
      data: {
        categoryId: input.categoryId,
        description: input.description,
        status: "ACTIVE",
        staffSelectionMode: "OPTIONAL",
      },
    });
  }

  return prisma.service.create({
    data: {
      organizationId: input.organizationId,
      categoryId: input.categoryId,
      name: input.name,
      description: input.description,
      status: "ACTIVE",
      staffSelectionMode: "OPTIONAL",
    },
  });
}

async function upsertRestaurantData(
  prisma: PrismaClientType,
  input: {
    businessId: string;
    branchId: string;
    restaurant: NonNullable<SeedBusiness["restaurant"]>;
  },
) {
  const existingTable = await prisma.restaurantTable.findFirst({
    where: {
      businessId: input.businessId,
      branchId: input.branchId,
      name: input.restaurant.table.name,
    },
  });

  if (existingTable) {
    await prisma.restaurantTable.update({
      where: { id: existingTable.id },
      data: {
        code: input.restaurant.table.code,
        capacity: input.restaurant.table.capacity,
        area: input.restaurant.table.area,
        isActive: true,
      },
    });
  } else {
    await prisma.restaurantTable.create({
      data: {
        businessId: input.businessId,
        branchId: input.branchId,
        name: input.restaurant.table.name,
        code: input.restaurant.table.code,
        capacity: input.restaurant.table.capacity,
        area: input.restaurant.table.area,
        isActive: true,
      },
    });
  }

  const menuCategory = await upsertMenuCategory(prisma, {
    businessId: input.businessId,
    name: input.restaurant.menuCategory.name,
    description: input.restaurant.menuCategory.description,
  });

  await upsertMenuItem(prisma, {
    businessId: input.businessId,
    menuCategoryId: menuCategory.id,
    name: input.restaurant.menuItem.name,
    description: input.restaurant.menuItem.description,
    price: input.restaurant.menuItem.price,
    preparationMinutes: input.restaurant.menuItem.preparationMinutes,
  });
}

async function upsertMenuCategory(
  prisma: PrismaClientType,
  input: {
    businessId: string;
    name: string;
    description: string;
  },
) {
  const existing = await prisma.menuCategory.findFirst({
    where: {
      businessId: input.businessId,
      name: input.name,
    },
  });

  if (existing) {
    return prisma.menuCategory.update({
      where: { id: existing.id },
      data: {
        description: input.description,
        sortOrder: 0,
        isActive: true,
      },
    });
  }

  return prisma.menuCategory.create({
    data: {
      businessId: input.businessId,
      name: input.name,
      description: input.description,
      sortOrder: 0,
      isActive: true,
    },
  });
}

async function upsertMenuItem(
  prisma: PrismaClientType,
  input: {
    businessId: string;
    menuCategoryId: string;
    name: string;
    description: string;
    price: string;
    preparationMinutes: number;
  },
) {
  const existing = await prisma.menuItem.findFirst({
    where: {
      businessId: input.businessId,
      menuCategoryId: input.menuCategoryId,
      name: input.name,
    },
  });

  if (existing) {
    await prisma.menuItem.update({
      where: { id: existing.id },
      data: {
        description: input.description,
        price: input.price,
        currency: "IQD",
        isAvailable: true,
        sortOrder: 0,
        preparationMinutes: input.preparationMinutes,
      },
    });
    return;
  }

  await prisma.menuItem.create({
    data: {
      businessId: input.businessId,
      menuCategoryId: input.menuCategoryId,
      name: input.name,
      description: input.description,
      price: input.price,
      currency: "IQD",
      isAvailable: true,
      sortOrder: 0,
      preparationMinutes: input.preparationMinutes,
    },
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
