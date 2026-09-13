import * as usersModel from "../server/models/users.model";
import { hashPassword } from "../server/utils/auth";
import { FALLBACK_ADMIN_PASSWORD, usesFallbackAdminPassword } from "../server/utils/bootstrap";

async function seedDefaultAdmin() {
  const username = process.env.DEFAULT_ADMIN_USERNAME || "admin";
  const password = process.env.DEFAULT_ADMIN_PASSWORD || FALLBACK_ADMIN_PASSWORD;
  const fullName = process.env.DEFAULT_ADMIN_NAME || "System Admin";

  const users = await usersModel.getUsers();
  if (users.length > 0) {
    const hasAdmin = users.some((u) => (u.role || "").toLowerCase() == "admin");
    if (hasAdmin) {
      console.log("Seed skipped: admin already exists.");
      return;
    }
    console.log("Seed skipped: users already exist.");
    return;
  }

  await usersModel.createUser({
    username,
    password: hashPassword(password),
    fullName,
    role: "admin",
    isActive: true,
    // Only force a rotation for the fallback password; an operator who supplied
    // DEFAULT_ADMIN_PASSWORD already chose a secret of their own.
    mustChangePassword: usesFallbackAdminPassword(password),
  });

  console.log(`Default admin created (username: ${username}).`);
  if (usesFallbackAdminPassword(password)) {
    console.log("Fallback password used; the admin must change it at first login.");
  }
}

seedDefaultAdmin()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
