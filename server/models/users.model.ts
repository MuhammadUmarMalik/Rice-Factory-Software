/**
 * User persistence, extracted from the "// Users" section of storage.ts.
 *
 * Plain functions over the shared `db` handle, called directly by the auth
 * controller and the bootstrap path.
 */
import { db } from "./db";
import { eq } from "drizzle-orm";
import { users, type User, type InsertUser } from "../db/schema";

/** Either the shared client or a transaction-scoped one. */
type DbClient = typeof db;

export async function getUser(id: number): Promise<User | undefined> {
  const [user] = db.select().from(users).where(eq(users.id, id)).all();
  return user;
}

export async function getUserByUsername(username: string): Promise<User | undefined> {
  const [user] = db.select().from(users).where(eq(users.username, username)).all();
  return user;
}

export async function createUser(user: InsertUser): Promise<User> {
  const [newUser] = await db.insert(users).values(user).returning();
  return newUser;
}

/**
 * Seeds the very first administrator, returning null when any user already
 * exists. The existence check and the insert share one transaction so two
 * concurrent bootstraps cannot both decide the table is empty.
 */
export async function createFirstAdmin(user: InsertUser): Promise<User | null> {
  return db.transaction((tx) => {
    const client = tx as unknown as DbClient;
    const [existing] = client.select({ id: users.id }).from(users).limit(1).all();
    if (existing) return null;
    return client.insert(users).values(user).returning().get();
  });
}

export async function updateUser(
  id: number,
  updates: Partial<InsertUser>,
): Promise<User | undefined> {
  const [updated] = await db.update(users).set(updates).where(eq(users.id, id)).returning();
  return updated;
}

export async function getUsers(): Promise<User[]> {
  return db.select().from(users).orderBy(users.fullName).all();
}
