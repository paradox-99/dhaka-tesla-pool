import { prisma } from "../../lib/prisma.js";

export async function listZones() {
  return prisma.zone.findMany({
    orderBy: { id: "asc" },
    select: { id: true, name: true, x: true, y: true },
  });
}