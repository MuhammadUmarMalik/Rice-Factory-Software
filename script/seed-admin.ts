import { storage } from "../server/models/storage";
import { hashPassword } from "../server/utils/auth";

async function seedDefaultAdmin() {
  const username = process.env.DEFAULT_ADMIN_USERNAME || "admin";
  const password = process.env.DEFAULT_ADMIN_PASSWORD || "admin123";
  const fullName = process.env.DEFAULT_ADMIN_NAME || "System Admin";

  const users = await storage.getUsers();
  if (users.length > 0) {
    const hasAdmin = users.some((u) => (u.role || "").toLowerCase() == "admin");
    if (hasAdmin) {
      console.log("Seed skipped: admin already exists.");
      return;
    }
    console.log("Seed skipped: users already exist.");
    return;
  }

  await storage.createUser({
    username,
    password: hashPassword(password),
    fullName,
    role: "admin",
    isActive: true,
  });

  console.log(`Default admin created (username: ${username}).`);
}

seedDefaultAdmin()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
