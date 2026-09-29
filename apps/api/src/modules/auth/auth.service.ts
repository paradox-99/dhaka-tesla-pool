import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "../../lib/prisma.js";
import { env } from "../../config/env.js";
import { AppError } from "../../errors/AppError.js";
import { Prisma, type User } from "../../generated/prisma/client.js";
import type { RegisterInput, LoginInput } from "./auth.schemas.js";

const BCRYPT_COST = 10;
const TOKEN_EXPIRY = "1d";

function signToken(userId: string, role: string) {
  return jwt.sign({ sub: userId, role }, env.JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

function toPublicUser(user: User) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    walletBalancePaisa: user.walletBalancePaisa,
    createdAt: user.createdAt,
  };
}

function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

export async function register(input: RegisterInput) {
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);

  try {
    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        phone: input.phone,
        passwordHash,
        role: "PASSENGER",
      },
    });
    return { token: signToken(user.id, user.role), user: toPublicUser(user) };
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      throw new AppError(409, "EMAIL_TAKEN", "An account with this email already exists");
    }
    throw err;
  }
}

export async function login(input: LoginInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) {
    throw new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");
  }

  const passwordMatches = await bcrypt.compare(input.password, user.passwordHash);
  if (!passwordMatches) {
    throw new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");
  }

  return { token: signToken(user.id, user.role), user: toPublicUser(user) };
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { vehicle: true },
  });
  if (!user) {
    throw new AppError(404, "NOT_FOUND", "User not found");
  }

  return { ...toPublicUser(user), vehicle: user.vehicle ?? undefined };
}
